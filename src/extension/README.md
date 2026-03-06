# Amazon Review Scraper — Chrome Extension

A Manifest V3 Chrome extension that scrapes Amazon product reviews directly in the browser and downloads them as a structured file. No local server, no Python runtime required.

## Installation (unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (`src/extension/`).

The extension icon appears in the toolbar. It turns orange on Amazon product pages and grey everywhere else.

## Usage

1. Navigate to any Amazon product page — either `amazon.com/dp/{ASIN}` or `amazon.com/product-reviews/{ASIN}`.
2. Click the extension icon to open the popup.
3. Adjust settings if needed (see below), then click **Scrape this product**.
4. The extension opens background tabs, one per selected star filter, and pages through reviews automatically.
5. When finished, the file downloads to `~/Downloads/{ASIN}.{ext}` and the popup shows the result summary.

Scraping is resumable: if you close the browser mid-run and scrape the same product again, previously collected reviews are pre-loaded from `chrome.storage.local` and the new run only adds what's missing (deduplication by `review_id`).

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Stars to scrape | All (1–5) | Check/uncheck which star filters to include. |
| Export format | JSON | Output file format: JSON, JSONL, or CSV (see below). |
| Max pages | 5 | Maximum review pages fetched per star filter. Amazon shows ~10 reviews per page. |

All settings are persisted in `chrome.storage.local` and survive popup close/reopen.

## Export formats

| Format | File | Notes |
|--------|------|-------|
| **JSON** | `{ASIN}.json` | Array of review objects, 2-space indented. |
| **JSONL** | `{ASIN}.jsonl` | One JSON object per line — line count equals review count. |
| **CSV** | `{ASIN}.csv` | UTF-8 with BOM (Excel-compatible); one row per review; body newlines replaced with `\n` literal to keep each review on a single row. |

### Review fields (all formats)

| Field | Type | Description |
|-------|------|-------------|
| `review_id` | string | Amazon's internal review ID (from the `<li>` `id` attribute). |
| `reviewer_name` | string | Display name of the reviewer. |
| `rating` | number | Star rating (1.0–5.0). |
| `title` | string | Review headline. |
| `body` | string | Full review text. |
| `date` | string | ISO 8601 date (`YYYY-MM-DD`), or raw date string if unparseable. |
| `country` | string | Country string extracted from the date line (e.g. `"the United States"`). |
| `verified_purchase` | boolean | `true` if the "Verified Purchase" badge is present. |
| `helpful_votes` | number | Number of "helpful" votes. |
| `scraped_at` | string | ISO 8601 timestamp of when the page was scraped. |

## Error states

| Error | Cause | Fix |
|-------|-------|-----|
| CAPTCHA | Amazon showed a bot-check page. | Open a tab, solve the CAPTCHA at `amazon.com`, then scrape again. |
| Login wall | Reviews require sign-in. | Log in to Amazon in Chrome, then scrape again. |
| Wrong page | Geo-redirect or VPN interference. | Disable the VPN and try again. |

Use the **Reset (if stuck)** button if the popup shows "Scraping…" but no progress is being made (clears the `status` key from storage).

## File structure

```structure
src/extension/
  manifest.json          # MV3 manifest
  background.js          # Service worker — event wiring only
  scraper.js             # Orchestrator: loops stars × pages, downloads file
  extractor.js           # Wraps review-extractor.js via executeScript
  review-extractor.js    # Content script injected into the review tab
  locales.js             # Date / helpful-vote patterns per language
  tab-utils.js           # Tab lifecycle helpers (open, click Next, poll DOM)
  icons.js               # Badge colour helpers
  popup.html             # Extension popup UI
  popup.js               # Popup logic and settings persistence
```

## Running the JS test suite

Tests use Jest + jsdom and live in `tests/js/`.

```bash
npm test
```
