# Amazon Review Scraper

Collects and structures Amazon product reviews into clean JSON files ready for LLM analysis.

Built in two phases: a **semi-automated HTML parser** (Phase 1, complete) and a **Chrome extension + local server** (Phase 2, in progress) that scrapes reviews on demand with one click.

---

## Requirements

- Python 3.13+
- [`uv`](https://docs.astral.sh/uv/) (package manager)

---

## Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd amazon-review-scrapper

# 2. Install dependencies
uv sync
```

That's it. No virtual environment activation needed — `uv run` handles it.

---

## Phase 1: Semi-Automated Usage

### Step 1 — Save a review page as HTML

1. Open a product's reviews on Amazon, e.g.:
   `https://www.amazon.com/product-reviews/B08HHQWBBZ`
2. Filter by star rating (e.g. "1 star")
3. In your browser: **File → Save Page As → Webpage, HTML Only**
4. Rename the file following this convention and move it to `raw_reviews/`:

```text
{ASIN}_{N}-star_{P}-page.html
```

| Part | Meaning | Example |
| ---- | ------- | ------- |
| `ASIN` | Amazon product ID (from the URL) | `B08HHQWBBZ` |
| `N` | Star filter applied | `1` |
| `P` | Page number | `1` |

Example filenames:

```text
raw_reviews/B08HHQWBBZ_1-star_1-page.html
raw_reviews/B08HHQWBBZ_1-star_2-page.html
raw_reviews/B08HHQWBBZ_5-star_1-page.html
```

Repeat for each page and star filter you want to collect.

---

### Step 2 — Parse

Process all files in `raw_reviews/` in one command:

```bash
uv run main.py parse
```

Or parse a single file:

```bash
uv run main.py parse --file raw_reviews/B08HHQWBBZ_1-star_1-page.html
```

Output is written to `output/{ASIN}_{timestamp}.json`, e.g.:

```text
output/B08HHQWBBZ_20260305_163240.json
```

Each run produces a new timestamped file. Reviews from multiple input pages for the same ASIN are merged and deduplicated into a single output file per run.

---

### Step 3 — Inspect

Print a summary for a product:

```bash
uv run main.py show --asin B08HHQWBBZ
```

```text
ASIN:    B08HHQWBBZ
File:    output/B08HHQWBBZ_20260305_163240.json
Reviews: 20

Rating breakdown:
  5★   0
  4★   0
  3★   0
  2★   0
  1★  ████████████████████ 20
```

---

### Step 4 — Export for LLM analysis

Dump all reviews as JSONL (one JSON object per line) to stdout:

```bash
uv run main.py export --asin B08HHQWBBZ
```

Pipe to a file:

```bash
uv run main.py export --asin B08HHQWBBZ > reviews.jsonl
```

---

## Output Schema

Each review is a flat JSON object:

```json
{
  "review_id":         "R3SIJ21XK7VTUD",
  "asin":              "B08HHQWBBZ",
  "reviewer_name":     "Inna",
  "title":             "WARNING!!!! PLEASE READ BEFOR YOU BUY !",
  "body":              "I feel obligated to share...",
  "rating":            1.0,
  "date":              "2023-10-25",
  "country":           "the United States",
  "verified_purchase": true,
  "helpful_votes":     637,
  "scraped_at":        "2026-03-05T16:32:40Z"
}
```

---

## Development

### Running the test suite

```bash
uv run pytest
```

Run with verbose output to see each test name:

```bash
uv run pytest -v
```

The suite covers:

| Area | What is tested |
| ---- | -------------- |
| **Models** | `rating` rejects values outside 1.0–5.0; `helpful_votes` rejects negatives |
| **Parser** | Standard extraction, ASIN from HTML content, ASIN fallback from filename, non-English titles (hidden span filtering), multi-line body, multi-line date normalization, helpful-vote counts (`N people`, `One person`), verified-purchase detection |
| **Storage** | Fresh write, upsert adds new reviews, upsert skips duplicates, returned `(added, total)` counts |

Fixture HTML files live in `tests/fixtures/`. Add a new `.html` file there and a matching test in `tests/test_parser.py` when you want to cover a new extraction scenario.

---

## Project Structure

```text
raw_reviews/          ← input: manually saved HTML pages
output/               ← output: structured JSON per run
src/
  models/
    review.py         ← Pydantic Review model
  parsers/
    html_parser.py    ← BeautifulSoup extraction logic
  storage/
    json_storage.py   ← save/load review files
tests/
  fixtures/           ← minimal HTML files used as parser test inputs
  conftest.py         ← shared pytest fixtures (Review objects)
  test_models.py      ← model validation tests
  test_parser.py      ← HTML parser tests
  test_storage.py     ← storage upsert tests
docs/
  ROADMAP.md          ← epic-based project roadmap
main.py               ← CLI entry point
```

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

| Epic | Description | Status |
| ---- | ----------- | ------ |
| EPIC-001 | Core models & project scaffold | Complete |
| EPIC-002 | HTML parser, storage & CLI | Complete |
| EPIC-003 | Test suite | Complete |
| EPIC-004 | Browser extension + local ingest server | Active |
| EPIC-005 | Click-to-scrape with full star/page iteration | Pending |
| EPIC-006 | Output to local Downloads folder | Pending |
