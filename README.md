# Amazon Review Scraper

A Chrome extension that collects Amazon product reviews with one click and saves them as a structured JSON file in your Downloads folder — ready for analysis. No server, no terminal, no Python required.

---

## Prerequisites

- **Chrome** 120 or newer

---

## Install

1. **Download the repo** (or receive the `src/extension/` folder as a zip)

2. **Load the Chrome extension**
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked** and select the `src/extension/` folder

---

## Usage

1. Navigate to any Amazon product page — either `amazon.com/dp/{ASIN}` or `amazon.com/product-reviews/{ASIN}`
2. Click the orange star (★) icon in your Chrome toolbar
3. Optionally configure which star ratings to collect and the max number of pages per rating
4. Click **Scrape this product**
5. Wait for the popup to show **Done** — the extension scrapes all selected stars and pages automatically

---

## Output

When the scrape finishes, Chrome saves **`{ASIN}.json`** to your `~/Downloads/` folder automatically. Each review includes:

| Field | Description |
| --- | --- |
| `review_id` | Amazon's unique review ID |
| `reviewer_name` | Display name of the reviewer |
| `rating` | Star rating (1.0–5.0) |
| `title` | Review headline |
| `body` | Full review text (preserves line breaks) |
| `date` | Review date (`YYYY-MM-DD`) |
| `country` | Country where the review was written |
| `verified_purchase` | Whether Amazon marked it as a verified purchase |
| `helpful_votes` | Number of "helpful" votes |
| `scraped_at` | ISO timestamp of when the review was collected |

---

## Troubleshooting

**Amazon shows a CAPTCHA**
→ The extension will report a CAPTCHA error in the popup. Switch to the Amazon tab the extension opened, solve the CAPTCHA, then click **Scrape again**.

**Extension won't load / no star icon in toolbar**
→ Make sure **Developer mode** is enabled in `chrome://extensions`, then try **Load unpacked** again and select the `src/extension/` folder.

**Scrape finishes but no file appears in Downloads**
→ Check that Chrome has permission to download files. Go to `chrome://settings/content/automaticDownloads` and make sure downloads are not blocked.

---

## For Developers

The Python CLI and server remain in the repo for parsing locally-saved HTML files and inspecting stored data:

```sh
# Install dependencies
uv sync

# Parse raw HTML files from raw_reviews/ into output/
uv run main.py parse

# List all scraped products
uv run main.py list

# Show a summary for a specific product
uv run main.py show --asin B009LI7VRC

# Export a product's reviews as JSONL
uv run main.py export --asin B009LI7VRC

# Run the test suite
uv run pytest
```
