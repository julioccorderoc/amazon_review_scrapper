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

---

### EPIC-012 — Serverless: JS DOM Parser

* **Status:** `Complete`
* **Dependencies:** EPIC-010
* **Business Objective:** Replace the Python-based HTML parsing step with direct DOM extraction inside the live browser tab, eliminating the need for the local server to parse data.
* **Technical Boundary:** `background.js` only. Added one new function; `startScrape` not changed in this epic — that is EPIC-013.
* **What was done:**
  Added `extractReviews(tabId)` — injects a content script that queries the live DOM and returns `{ asin, reviews[], hasCaptcha }`. Direct JS port of `src/parsers/html_parser.py → _parse_review_li`. Retries once after 2 s on `chrome.runtime.lastError`, matching the existing pattern in `extractHtml` and `clickNextPage`.
* **Verification Criteria (Definition of Done):**
  * Calling `extractReviews` on a live Amazon review tab in the DevTools console returns a correctly shaped `{ asin, reviews[] }` object — confirmed.
  * All 10 fields present and correctly typed on each review object — confirmed.
  * Returns `{ asin: null, reviews: [], hasCaptcha: false }` on a non-review tab — confirmed.
  * `uv run pytest` — all 21 tests pass (no Python code changed) — confirmed.

---

### EPIC-013 — Serverless: Replace Server Pipeline

* **Status:** `Complete`
* **Dependencies:** EPIC-012
* **Business Objective:** The extension works end-to-end with no local server. Coworkers install the extension and click Scrape — a JSON file lands in Downloads with no other setup.
* **Technical Boundary:** `background.js`, `popup.html`, `popup.js`, `manifest.json`. The Python server and all Python source files are **not deleted** — they remain in the repo for developer CLI use.
* **What was done:**

  **`background.js`:**
  * `startScrape` now calls `extractReviews` instead of `extractHtml` + `postToServer`.
  * All reviews accumulated in `Map<review_id, review>` — cross-star deduplication baked in.
  * CAPTCHA detection uses `hasCaptcha` from `extractReviews`.
  * Cycle detection uses `reviews[0]?.review_id`.
  * On completion, downloads via `data:` URI (Blob URL API not available in MV3 service workers — see BUG-007).
  * `postToServer()` and `const SERVER` removed.

  **`popup.html`:** `#server-banner` div removed.

  **`popup.js`:** `checkServer()` removed; `setInterval(refresh, 1000)` restored; server error hint removed from error state.

  **`manifest.json`:** `http://localhost:8765/*` removed from `host_permissions`.

* **Verification Criteria (Definition of Done):**
  * Scraping `amazon.com/dp/{ASIN}` with the server **not running** completes successfully and downloads `{ASIN}.json` — confirmed.
  * Downloaded JSON contains all 10 fields, no duplicate `review_id`s across pages — confirmed.
  * No red banner appears when the popup opens — confirmed.
  * `uv run pytest` — all 21 tests still pass — confirmed.

---

### EPIC-014 — Modularize Extension: files: Injection + ES Modules

* **Status:** `Pending`
* **Dependencies:** EPIC-013
* **Business Objective:** Make the extension codebase maintainable. The current `background.js` is a single 600-line file mixing tab management, icon drawing, scrape orchestration, review extraction, and Chrome event wiring. Separating concerns makes each piece readable, independently changeable, and testable.
* **Technical Boundary:** `src/extension/` only. No Python changes. No user-visible behaviour changes.
* **Planned deliverables:**
  * Add `"type": "module"` to the background service worker declaration in `manifest.json` so `background.js` can use `import`/`export`.
  * Split background.js into ES modules:
    * `tab-utils.js` — `openTabAndLoad`, `clickNextPage`, `waitForReviewsToChange`, `waitForReviewsToAppear`
    * `icons.js` — `drawTabIcon`, `setTabIcon`
    * `scraper.js` — `startScrape`, `extractAsin`
    * `background.js` — Chrome event listeners only; imports from the above
  * Move the review extractor out of the inline `func:` string into `review-extractor.js` (a standalone content script). Switch `extractReviews` from `func:` to `files: ["review-extractor.js"]` injection. The file must assign its result to a well-known global or use `chrome.runtime.sendMessage` — whichever `executeScript` + `files:` requires.
  * `review-extractor.js` exports nothing at the module level (it runs as a content script); its logic is fully self-contained.
* **Verification Criteria (Definition of Done):**
  * Extension loads in Chrome without errors after the split.
  * Full English scrape produces identical output to pre-split (same fields, same counts).
  * Full Spanish scrape (Chrome UI set to Spanish) produces correct `rating`, `date`, `country`, `helpful_votes`.
  * `uv run pytest` — all 21 tests still pass.

---

### EPIC-015 — JS Test Suite for review-extractor.js

* **Status:** `Pending`
* **Dependencies:** EPIC-014
* **Business Objective:** Give the JS extractor the same regression safety net the Python parser has. Currently every locale fix requires a manual reload-and-check cycle. Automated tests catch regressions in seconds.
* **Technical Boundary:** New `tests/js/` directory. No changes to Python code or extension runtime behaviour.
* **Planned deliverables:**
  * Add Jest + jsdom as dev dependencies (`package.json`).
  * Create `tests/js/fixtures/` with minimal HTML files mirroring `tests/fixtures/` for the Python suite — at minimum: English review page, Spanish review page (using `spanish_page.html` as the source of truth).
  * Write `tests/js/review-extractor.test.js` covering:
    * Standard English review — all 10 fields correct
    * Spanish review — `rating`, `date`, `country`, `helpful_votes` all correct
    * Rating CSS class fallback (no `span.a-icon-alt`)
    * `helpful_votes` = 0 when element absent
    * `helpful_votes` > 0 for each supported locale pattern
    * `hasCaptcha` detection
    * `isWrongPage` detection
    * No `review_id` → review skipped
    * No `reviewer_name` → review skipped
  * `npm test` passes with zero failures.
* **Verification Criteria (Definition of Done):**
  * `npm test` runs the JS suite; zero failures.
  * `uv run pytest` still passes (Python suite unchanged).
  * Adding a new HTML fixture + test case for a new locale is a self-contained change in `tests/js/`.

---

### EPIC-016 — Locale Registry

* **Status:** `Pending`
* **Dependencies:** EPIC-014
* **Business Objective:** Eliminate the need to hunt through scattered regex arrays when adding a new Amazon locale. Every locale-specific piece of knowledge lives in one place; adding support for a new language is a single self-contained addition.
* **Technical Boundary:** `review-extractor.js` (created in EPIC-014) and a new `locales.js` file. No Python changes. No new locales are added in this epic — only refactoring existing ones.
* **Planned deliverables:**
  * Create `src/extension/locales.js` with a `LOCALES` array. Each entry is an object:

    ```js
    {
      code: "es",                  // BCP-47 language code (matches document.documentElement.lang)
      datePattern: /(?:Revisado|Calificado|...) en (.+?) el (.+)/i,
      monthMap: { enero: "January", ... },  // null for languages where new Date(s) works natively
      helpfulPattern: { re: /A\s+(\d+|una)\s+persona/i, parse: (m) => ... },
    }
    ```

  * `review-extractor.js` imports `LOCALES` and iterates it instead of maintaining its own inline arrays.
  * A `LOCALES.md` (in `src/extension/`) documents the registry shape and gives a step-by-step example for adding a new locale (what fields to fill in, how to find the date pattern on a live Amazon page, how to write a test fixture).
  * All currently supported locales (English, Spanish, Portuguese, French, German, Italian) are migrated into the registry — no new languages, no behaviour change.
* **Verification Criteria (Definition of Done):**
  * English and Spanish scrapes produce identical output to pre-refactor.
  * `npm test` (EPIC-015) — all JS tests pass.
  * `uv run pytest` — all 21 Python tests pass.
  * `LOCALES.md` documents: how to find a date pattern, how to add a month map, how to write the test fixture, and how to verify with a real Amazon page.

---

### EPIC-017 — Language Auto-detection

* **Status:** `Pending`
* **Dependencies:** EPIC-016
* **Business Objective:** Instead of trying every locale pattern in a waterfall until one matches, detect the page language upfront and go straight to the right locale. Faster, more predictable, easier to debug.
* **Technical Boundary:** `review-extractor.js` only.
* **Planned deliverables:**
  * Read `document.documentElement.lang` (e.g. `"es"`, `"es-US"`, `"en-US"`) at the start of extraction.
  * Match the language tag (prefix match on the `code` field) to a `LOCALES` entry. Fall back to the full waterfall if no match is found (graceful degradation for unlisted locales).
  * Log the detected locale to the console: `[ARS] detected lang=es → locale=es`.
  * The waterfall (current behaviour) remains as a fallback so pages with a missing or unexpected `lang` attribute still work.
* **Verification Criteria (Definition of Done):**
  * Console shows `[ARS] detected lang=…` on every scrape.
  * Spanish page resolves via direct lookup (not waterfall) — confirmed by log showing first pattern tried is the Spanish one.
  * English page still works correctly.
  * `npm test` and `uv run pytest` both pass.

---

### EPIC-018 — Persist Reviews Across Sessions

* **Status:** `Pending`
* **Dependencies:** EPIC-013
* **Business Objective:** Reviews accumulate across scrape sessions rather than being lost when the browser closes or the extension is reloaded. Re-scraping a product with new reviews only adds the delta. Coworkers can scrape a product over several days and get a complete dataset.
* **Technical Boundary:** `background.js` (`startScrape`), `popup.js`, `popup.html`. No Python changes.
* **Planned deliverables:**
  * After each star filter completes, upsert that star's reviews into `chrome.storage.local` under key `reviews:{ASIN}` (a JSON object keyed by `review_id`). This is the persistent store.
  * On scrape start, load any existing reviews for the ASIN from storage into `allReviews` before beginning, so the Map already contains prior sessions' data.
  * Popup idle state shows a "Previously collected: N reviews" line for the current tab's ASIN if stored reviews exist.
  * The downloaded JSON at the end of a scrape reflects the full accumulated set (prior + new), not just the current session.
  * A "Clear stored reviews for this product" button in the popup allows resetting without re-installing the extension.
  * Note: `chrome.storage.local` has a 10 MB quota. For very large products (thousands of reviews), the upsert should check remaining quota and warn the user rather than silently failing.
* **Verification Criteria (Definition of Done):**
  * Scrape product A (get 50 reviews). Close Chrome. Reopen. Scrape product A again (same 10 reviews on page 1, 10 new on page 2). Downloaded JSON contains 60 reviews, not 10 or 20.
  * Popup idle state shows "Previously collected: 50 reviews" before the second scrape.
  * "Clear" button removes stored reviews; subsequent idle state shows no count.
  * `uv run pytest` — all 21 tests pass.

---

### EPIC-019 — Export Formats (CSV and JSONL)

* **Status:** `Pending`
* **Dependencies:** EPIC-013
* **Business Objective:** Most coworkers analyze data in Excel or Google Sheets, not JSON viewers. Offering CSV removes a manual conversion step. JSONL (one review per line) is the format the Python pipeline already uses and is easier to stream into LLM tools.
* **Technical Boundary:** `background.js` (download logic), `popup.html`, `popup.js`. No Python changes.
* **Planned deliverables:**
  * Add a format selector to the popup (radio or dropdown): JSON / CSV / JSONL. Default: JSON (preserves current behaviour). Selection is persisted in `chrome.storage.local` under key `exportFormat`.
  * In `startScrape`, after accumulating all reviews, serialize to the chosen format before building the `data:` URI:
    * **JSON** — existing behaviour (`JSON.stringify` with 2-space indent).
    * **JSONL** — one `JSON.stringify(review)` per line, no indent, `\n` separator.
    * **CSV** — header row matching the 10 field names; one row per review; values quoted if they contain commas or newlines; `body` newlines replaced with `\n` literal so the cell stays single-row in Excel.
  * Filename uses the correct extension: `{ASIN}.json`, `{ASIN}.jsonl`, `{ASIN}.csv`.
* **Verification Criteria (Definition of Done):**
  * Selecting CSV and scraping produces a file that opens correctly in Excel (all 10 columns, no broken rows from body newlines).
  * Selecting JSONL produces a file where `wc -l` equals the review count.
  * Selecting JSON produces identical output to the pre-epic behaviour.
  * Format selection persists across popup open/close cycles.
  * `uv run pytest` — all 21 tests pass.
