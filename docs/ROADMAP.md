# ROADMAP

* **Version:** 0.2.0
* **Last Updated:** 2026-03-05
* **Primary Human Owner:** juliocordero

## Operating Rules for the Planner Agent

1. You may only move one Epic to `Active` at a time.
2. Before marking an Epic `Complete`, you must verify all its Success Criteria are met in the main branch.
3. Do not parse or extract Epics that depend on incomplete prerequisites.

## Epic Ledger

### EPIC-001 — Phase 1: Core Models & Project Scaffold

* **Status:** `Complete`
* **Dependencies:** None
* **Business Objective:** Establish the shared data schema and project structure that both phases depend on. All review data — regardless of how it was collected — flows through these models.
* **Technical Boundary:** Pydantic models (`Review`), `pyproject.toml` dependencies for Phase 1, and the target directory layout (`src/models/`, `src/parsers/`, `src/storage/`, `output/`).
* **Verification Criteria (Definition of Done):**
  * `src/models/review.py` defines `Review` with all fields.
  * `pyproject.toml` includes `beautifulsoup4`, `lxml`, and `pydantic` as dependencies.
  * All `__init__.py` stubs are in place; `uv run python -c "from src.models.review import Review"` succeeds.
  * Model round-trips correctly: a `Review` instance serializes to JSON and deserializes back without data loss.

### EPIC-002 — Phase 1: HTML Parser, Storage & CLI

* **Status:** `Complete`
* **Dependencies:** EPIC-001
* **Business Objective:** Enable the user to drop manually-saved Amazon review HTML pages into `raw_reviews/` and run a single command to produce clean, structured data ready for LLM analysis.
* **Technical Boundary:** `src/parsers/html_parser.py` (CSS-selector-based extraction), `src/storage/json_storage.py` (upsert into `output/{ASIN}.json`), and `main.py` CLI (`parse`, `show`, `list`, `export` subcommands). No network calls; all input is local files only.
* **Verification Criteria (Definition of Done):**
  * `uv run main.py parse` processes all `.html` files in `raw_reviews/`, extracts the ASIN from HTML content (falls back to filename), and upserts into `output/{ASIN}.json`.
  * All review fields (`review_id`, `title`, `body`, `rating`, `date`, `country`, `verified_purchase`, `helpful_votes`) are correctly extracted, including multi-line dates and non-English titles.
  * Re-running `parse` on the same files adds 0 new reviews (dedup by `review_id`).
  * `uv run main.py list` shows all scraped ASINs with total counts and star breakdown.
  * `uv run main.py export --asin X` outputs valid JSONL with one review object per line.

### EPIC-003 — Phase 1: Test Suite

* **Status:** `Complete`
* **Dependencies:** EPIC-002
* **Business Objective:** Give teammates confidence when adding new HTML files or modifying the parser. Regressions should be caught immediately, not discovered when reviews come out wrong.
* **Technical Boundary:** `pytest` test suite under `tests/`. Tests cover the parser (using sample HTML files as fixtures), the storage upsert logic, and the `Review` model validation. No mocking of file I/O — tests use real fixture files.
* **Verification Criteria (Definition of Done):**
  * `uv run pytest` passes with zero failures.
  * Parser tests cover: standard review extraction, multi-line date, non-English title (hidden span), zero helpful votes, ASIN from HTML content, ASIN fallback from filename.
  * Storage tests cover: fresh write, upsert adds new reviews, upsert skips duplicates, returned counts are correct.
  * Model tests cover: `rating` validation rejects values outside 1.0–5.0, `helpful_votes` rejects negatives.
  * `pytest` is added to `pyproject.toml` as a dev dependency.

### EPIC-004 — Phase 2: Browser Extension + Local Ingest Server

* **Status:** `Complete`
* **Dependencies:** EPIC-003
* **Business Objective:** Remove the manual save step entirely. A Chrome extension captures Amazon review pages and sends them to a local FastAPI server, which feeds the existing parser.
* **Technical Boundary:** Chrome MV3 extension (`src/extension/`) + FastAPI server (`src/phase2/server.py`). No changes to `src/models/` or `src/parsers/`.
* **Verification Criteria (Definition of Done):**
  * Extension loads as unpacked in Chrome without errors.
  * Local server (`uv run main.py serve`) starts on `localhost:8765`, receives POSTs, and upserts reviews.
  * `uv run main.py list` reflects new reviews after a scrape completes.

### EPIC-005 — Phase 2: Click-to-Scrape with Full Star/Page Iteration

* **Status:** `Complete`
* **Dependencies:** EPIC-004
* **Business Objective:** One-click scrape: the user clicks the extension icon on any Amazon product page and the extension automatically collects all reviews across selected star ratings and pages without manual navigation.
* **Technical Boundary:** Background service worker iterates stars × pages. Pagination is click-based (simulates clicking "Next" inside a live background tab) because Amazon loads review pages via client-side AJAX — `?pageNumber=N` in the URL is ignored by Amazon's server. Configurable `maxPages` (default 5) and star filter selection in the popup.
* **Key implementation insight (BUG-006):** Amazon's server always returns page 1 content regardless of `?pageNumber=N`. Pages 2+ are only reachable by clicking the "Next" button inside a live browser tab, which triggers an AJAX update. The fix: one background tab per star filter; programmatic click on `.a-pagination li.a-last:not(.a-disabled) a`; 3 s settle delay for the AJAX to complete.
* **Verification Criteria (Definition of Done):**
  * Clicking "Scrape this product" on `amazon.com/dp/{ASIN}` scrapes all selected stars and pages.
  * Pages 2+ return different review IDs from page 1 (confirmed via `first_ids` logging).
  * Popup shows live progress (star, page, running total).
  * All reviews are deduplicated; re-scraping adds 0 duplicates.
  * `uv run pytest` — all 21 tests pass.

### EPIC-006 — Phase 2: Output to Local Downloads Folder

* **Status:** `Complete`
* **Dependencies:** EPIC-005
* **Business Objective:** Deliver scraped data directly to the user's Downloads folder — no terminal navigation needed.
* **Technical Boundary:** `GET /output/{asin}` endpoint on the FastAPI server; `chrome.downloads.download()` in the background script after scrape completion; `"downloads"` permission in `manifest.json`.
* **Verification Criteria (Definition of Done):**
  * After scraping completes, Chrome saves `{ASIN}.json` to `~/Downloads/` automatically.
  * Popup confirms the saved filename.
  * `uv run main.py list` and the downloaded file show identical review counts.

---

### EPIC-007 — Speed Optimization: DOM-Polling Settle

* **Status:** `Pending`
* **Dependencies:** EPIC-005
* **Business Objective:** Reduce full-scrape time from ~5–8 minutes to ~2–3 minutes without sacrificing reliability. The current `TAB_SETTLE_MS = 3000ms` fixed delay per page is conservative; Amazon's AJAX typically completes in under 1 second.
* **Technical Boundary:** `background.js` only. Replace `await sleep(TAB_SETTLE_MS)` after each `clickNextPage` with a DOM-polling loop that detects when the first review ID has changed. Fall back to a 5-second hard timeout if the DOM never updates (CAPTCHA, last page, etc.).
* **Verification Criteria (Definition of Done):**
  * Effective per-page wait time is ≤ 1.5 s on a normal connection (measured via console timestamps).
  * `first_ids` in server logs still differ between pages (correctness unchanged).
  * The 5-second fallback timeout fires correctly when the "Next" button is clicked but no new reviews appear (tested by manually disabling AJAX in DevTools).
  * `uv run pytest` — all 21 tests still pass.

### EPIC-008 — Robustness

* **Status:** `Pending`
* **Dependencies:** EPIC-007
* **Business Objective:** Make the scraper resilient to the real-world failure modes encountered during development: CAPTCHAs, per-star tab crashes, Amazon returning the same page twice, and transient server errors.
* **Technical Boundary:** `background.js` and `src/phase2/server.py`.
* **Planned improvements:**
  * **CAPTCHA detection:** if `li[data-hook="review"]` is absent but a CAPTCHA element is present in the DOM, stop that star filter and surface a human-readable popup error ("Amazon showed a CAPTCHA — please solve it manually, then re-scrape").
  * **Per-star error isolation:** wrap each star's tab lifecycle in its own `try/catch` so a tab crash or timeout on one star doesn't abort remaining stars.
  * **Cycle detection:** if `first_ids` on the new page match the previous page's `first_ids`, treat it as end-of-pages and break.
  * **Single retry:** on `executeScript` failure or server 5xx, retry once with a 2 s backoff.
* **Verification Criteria (Definition of Done):**
  * Manually triggering a CAPTCHA (by scraping aggressively) shows a clear popup error message and does not corrupt stored data.
  * Killing a scrape tab mid-scrape causes that star to be skipped; remaining stars complete normally.
  * Re-scraping a product with only 1 page of reviews per star terminates at the correct page (no infinite cycle).

### EPIC-009 — Distribution / Packaging

* **Status:** `Pending`
* **Dependencies:** EPIC-006
* **Business Objective:** Enable non-technical coworkers to install and use the tool with minimal setup — no terminal commands beyond a single install step.
* **Planned deliverables:**

  **Short term (one afternoon):**
  * `README.md` — top-level install guide with screenshots:
    1. Clone the repo.
    2. Install `uv` (one `curl` command).
    3. Start the server: `uv run main.py serve`.
    4. Install the extension: `chrome://extensions` → Load unpacked → `src/extension/`.
    5. Navigate to an Amazon product page and click the extension icon.
  * `start-server.sh` — convenience script that checks for `uv`, prints a helpful error if missing, then runs `uv run main.py serve`.

  **Medium term (Chrome Web Store):**
  * Publish the extension to the Chrome Web Store as a private group listing (visible only to invited Google accounts). Eliminates the need for developer mode in Chrome.
  * Cost: $5 one-time developer registration fee.
  * Timeline: 1–7 day review once submitted.

  **Longer term (standalone binary):**
  * Package the Python server as a native app using PyInstaller (macOS `.app` / Windows `.exe`) so coworkers with no Python experience can double-click to start the server.
  * Bundle with an Electron or Tauri wrapper if a system-tray icon is desired.

* **Verification Criteria (Definition of Done):**
  * A coworker with no prior setup can install and run a full scrape following only the README.
  * `start-server.sh` is executable and works on macOS and Linux out of the box.
  * (Web Store milestone) Extension installs in Chrome without enabling developer mode.
