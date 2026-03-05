# Amazon Review Scraper

## Project Overview

A two-phase tool for collecting and structuring Amazon product reviews for LLM analysis.

- **Phase 1 (current):** Semi-automated — user saves raw HTML pages manually, parser extracts and stores structured data.
- **Phase 2 (future):** Fully automated via browser automation (Playwright) or a browser extension.

## Tech Stack

- Python 3.13
- `uv` for dependency management
- `beautifulsoup4` + `lxml` for HTML parsing
- `pydantic` for data models and validation
- `playwright` (Phase 2 only)

## Project Structure

```
raw_reviews/          # Input: manually saved HTML files (gitignored in production)
data/reviews/         # Output: structured JSON storage (gitignored)
src/
  models/             # Pydantic models (Review, ProductReviews, ReviewsDB)
  parsers/            # HTML parsing logic (BeautifulSoup)
  storage/            # JSON read/write helpers
  phase2/             # Browser automation (Phase 2, not yet implemented)
main.py               # CLI entry point
```

## Raw HTML File Naming Convention

Files in `raw_reviews/` must follow this pattern:

```
{ASIN}_{N}-star_{P}-page.html
```

Example: `B08HHQWBBZ_1-star_2-page.html`

- `ASIN` — Amazon product identifier
- `N` — star filter applied when the page was saved (1–5)
- `P` — pagination page number

## .ai/ Folder

AI session support files — not application code.

| File | Purpose |
|------|---------|
| `.ai/CURRENT_PLAN.md` | Active architecture/implementation plan for the current work session |
| `.ai/MEMORY.md` | Persistent notes: decisions, conventions, and context that should carry across sessions |
| `.ai/ERRORS.md` | Log of non-obvious bugs or gotchas encountered during development |

## Key Conventions

- All output goes in `data/reviews/` as JSONL (one review per line) or per-product JSON files.
- Parsing is stateless: re-running the parser on the same files should produce the same output.
- Phase 1 never touches the network — it only reads local HTML files.
- Pydantic models are the single source of truth for the data schema.
