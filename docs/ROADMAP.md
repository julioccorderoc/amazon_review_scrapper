# ROADMAP

* **Version:** 0.1.0
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

* **Status:** `Active`
* **Dependencies:** EPIC-003
* **Business Objective:** Remove the manual save step entirely. The user installs a local Chrome/Edge extension that automatically captures Amazon review pages as they are browsed and sends them to a local server, which feeds the existing parser.
* **Technical Boundary:** A Chrome Manifest V3 extension (`src/extension/`) that detects Amazon review pages and POSTs the review HTML to a local `fastapi` server (`src/phase2/server.py`). The server calls `parse_file()` directly and upserts into `output/{ASIN}.json`. No changes to `src/models/` or `src/parsers/`.
* **Verification Criteria (Definition of Done):**
  * Extension loads as an unpacked extension in Chrome/Edge (`chrome://extensions` → Load unpacked) without errors.
  * Navigating to an Amazon product review page with the extension active automatically sends the review HTML to the local server.
  * Local server (`uv run main.py serve`) starts on `localhost:8765`, receives the POST, and upserts reviews into `output/{ASIN}.json`.
  * `uv run main.py list` reflects new reviews within 5 seconds of the page load.
  * Visiting multiple star-filter pages for the same product correctly accumulates all reviews without duplicates.
