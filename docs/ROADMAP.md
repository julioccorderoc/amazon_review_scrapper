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
* **Technical Boundary:** Pydantic models (`Review`, `ProductReviews`, `ReviewsDB`), `pyproject.toml` dependencies for Phase 1, and the target directory layout (`src/models/`, `src/parsers/`, `src/storage/`, `data/reviews/`).
* **Verification Criteria (Definition of Done):**
  * `src/models/review.py` defines `Review`, `ProductReviews`, and `ReviewsDB` with all fields documented in `.ai/CURRENT_PLAN.md`.
  * `pyproject.toml` includes `beautifulsoup4`, `lxml`, and `pydantic` as dependencies.
  * All `__init__.py` stubs are in place; `uv run python -c "from src.models.review import ReviewsDB"` succeeds.
  * Models round-trip correctly: a `ReviewsDB` instance serializes to JSON and deserializes back without data loss.

### EPIC-002 — Phase 1: HTML Parser, Storage & CLI

* **Status:** `Active`
* **Dependencies:** EPIC-001
* **Business Objective:** Enable the user to drop manually-saved Amazon review HTML files into `raw_reviews/` and run a single command to produce clean, structured data ready for LLM analysis.
* **Technical Boundary:** `src/parsers/html_parser.py` (BeautifulSoup extraction), `src/storage/json_storage.py` (read/write `ReviewsDB`), and `main.py` CLI (`parse`, `show`, `export` subcommands). No network calls; all input is local files only.
* **Verification Criteria (Definition of Done):**
  * `uv run main.py parse` processes all files in `raw_reviews/` matching `{ASIN}_{N}-star_{P}-page.html` and writes `data/reviews/db.json`.
  * All review fields (`review_id`, `title`, `body`, `rating`, `date`, `country`, `verified_purchase`, `helpful_votes`) are correctly extracted from the existing sample files (`B08HHQWBBZ_1-star_*.html`).
  * Re-running `parse` on already-processed files produces no duplicates (`processed_files` deduplication works).
  * `uv run main.py export --asin B08HHQWBBZ` outputs valid JSONL with one review object per line.
  * `uv run main.py show --asin B08HHQWBBZ` prints a human-readable summary (total reviews, rating breakdown).

### EPIC-003 — Phase 2: Browser Extension + Local Ingest Server

* **Status:** `Pending`
* **Dependencies:** EPIC-002
* **Business Objective:** Remove the manual save step entirely. The user installs a local Chrome/Edge extension that automatically captures Amazon review pages as they are browsed and sends them to a local server, which feeds the existing Phase 1 parser.
* **Technical Boundary:** A Chrome Manifest V3 extension (`src/extension/`) that detects Amazon review pages and POSTs the review list HTML to a local `fastapi` server (`src/phase2/server.py`). The server saves the payload as a raw HTML file in `raw_reviews/` (preserving the naming convention) and immediately triggers the Phase 1 parser. No changes to `src/models/` or `src/parsers/`.
* **Verification Criteria (Definition of Done):**
  * Extension loads as an unpacked extension in Chrome/Edge (`chrome://extensions` → Load unpacked) without errors.
  * Navigating to an Amazon product review page with the extension active automatically sends the review HTML to the local server.
  * Local server (`uv run main.py serve`) starts on `localhost:8765`, receives the POST, saves the file to `raw_reviews/` with the correct naming convention, and runs the parser.
  * `data/reviews/db.json` is updated with the new reviews within 5 seconds of the page load.
  * Visiting multiple star-filter pages for the same product correctly accumulates all reviews without duplicates.
