# ROADMAP

* **Version:** 0.3.0
* **Last Updated:** 2026-03-06
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
* **Key implementation insight (BUG-006):** Amazon's server always returns page 1 content regardless of `?pageNumber=N`. Pages 2+ are only reachable by clicking the "Next" button inside a live browser tab, which triggers an AJAX update. The fix: one background tab per star filter; programmatic click on `.a-pagination li.a-last:not(.a-disabled) a`; DOM-polling settle for the AJAX to complete.
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

* **Status:** `Complete`
* **Dependencies:** EPIC-005
* **Business Objective:** Reduce full-scrape time from ~5–8 minutes to ~2–3 minutes without sacrificing reliability.
* **Technical Boundary:** `background.js` only.
* **What was done:**
  * `TAB_SETTLE_MS` reduced from 3000 ms to 1500 ms (page-1 initial settle only).
  * Added `waitForReviewsToChange(tabId, prevId, maxWaitMs=5000)` — polls `li[data-hook="review"]:first-child` id every 200 ms; resolves `"changed"` or `"timeout"`.
  * After each `clickNextPage`, the scraper now waits for DOM change instead of sleeping a fixed duration.
* **Verification Criteria (Definition of Done):**
  * Console shows `reason=changed` within ~1 s for pages 2+; `reason=timeout` on over-page.
  * `first_ids` in server logs still differ between pages (correctness unchanged).
  * `uv run pytest` — all 21 tests pass.

### EPIC-008 — Robustness

* **Status:** `Complete`
* **Dependencies:** EPIC-007
* **Business Objective:** Make the scraper resilient to real-world failure modes: CAPTCHAs, tab crashes, Amazon returning the same page twice, and transient `executeScript` failures.
* **Technical Boundary:** `background.js` only.
* **What was done:**
  * **Per-star error isolation:** each star's tab lifecycle is wrapped in its own `try/catch`; a tab crash or timeout on one star logs and continues to the next.
  * **Cycle detection:** after `extractHtml`, if the first review ID equals the previous page's first ID, the page loop breaks — Amazon has looped back to page 1.
  * **CAPTCHA detection:** if no `data-hook="review"` elements are present and `"Enter the characters you see below"` is in the HTML, the star loop stops and a human-readable error is surfaced in the popup.
  * **Single retry:** `extractHtml` and `clickNextPage` retry once after 2 s on `chrome.runtime.lastError`.
* **Verification Criteria (Definition of Done):**
  * Killing a scrape tab mid-scrape causes that star to be skipped; remaining stars complete normally.
  * Re-scraping a product with only 1 page of reviews per star terminates at the correct page (no infinite cycle).

### EPIC-009 — Distribution / Packaging

* **Status:** `Complete`
* **Dependencies:** EPIC-006
* **Business Objective:** Enable non-technical coworkers to install and use the tool with minimal setup.
* **What was done:**
  * `README.md` — rewritten for non-developer coworkers: prerequisites, 4-step install, usage, output, troubleshooting.
  * `start-server.sh` — checks for `uv`, prints a helpful error if missing, runs `uv run main.py serve`. Executable.
  * `serve_entry.py` — PyInstaller-compatible entry point (direct app import, `multiprocessing.freeze_support()`).
  * `amazon_review_scraper.spec` — PyInstaller spec using `collect_all()` for uvicorn/fastapi/starlette/anyio; `--onefile` single binary output.
  * `build-macos.sh` — builds the binary and generates `dist/Amazon Review Scraper Server.command` (double-click Terminal launcher).
  * `build-windows.ps1` — builds `dist/amazon-review-scraper.exe` on Windows.
  * `pyinstaller>=6.0` added to dev dependencies.
* **Remaining (future):**
  * Chrome Web Store private group listing (eliminates Developer mode requirement; $5 one-time fee, 1–7 day review).
* **Verification Criteria (Definition of Done):**
  * `./start-server.sh` starts the server on macOS; prints clear error when `uv` is not on PATH.
  * `./build-macos.sh` produces `dist/amazon-review-scraper`; binary starts without Python on PATH.
  * `uv run pytest` — all 21 tests pass.

---

### EPIC-010 — Sharing & Polish

* **Status:** `Complete`
* **Dependencies:** EPIC-009
* **Business Objective:** Reduce friction for non-technical coworkers: surface server problems before they start scraping, show progress so the tool doesn't appear frozen, and reduce CAPTCHA frequency on back-to-back scrapes.
* **What was done:**
  * **Server health check** (`src/phase2/server.py`, `popup.html`, `popup.js`): `GET /health` endpoint added to the server. Popup pings it on open and every 1 s; a red banner appears immediately if the server is not reachable, and clears when it comes back up.
  * **Progress bar** (`popup.js`): the running state now shows an orange progress bar and percentage computed from `(starIndex × maxPages + page − 1) / (totalStars × maxPages)`, capped at 99% until the "done" state fires.
  * **Inter-star jitter** (`background.js`): `jitter(1000, 3000)` — a 1–3 s random pause between consecutive star filters — reduces CAPTCHA frequency on aggressive scrapes.
* **Verification Criteria (Definition of Done):**
  * Stop the server → open popup → red banner appears immediately.
  * Start the server → banner clears within 1 s.
  * Progress bar increments on each page during a multi-star scrape.
  * Console shows ~1–3 s gap between the last `[ARS] star=X` log and the next star's `opening tab →`.
  * `uv run pytest` — all 21 tests pass.

---

### EPIC-011 — Chrome Web Store Listing (Future)

* **Status:** `Pending`
* **Dependencies:** EPIC-010
* **Business Objective:** Remove the Chrome Developer mode requirement for installing the extension; coworkers install with one click.
* **Planned deliverables:**
  * Publish extension as a private group listing (visible only to invited Google accounts).
  * One-time $5 developer registration fee; 1–7 day review timeline.
* **Verification Criteria (Definition of Done):**
  * Extension installs in Chrome from the Web Store without enabling Developer mode.
  * Existing scrape functionality is unchanged post-publish.
