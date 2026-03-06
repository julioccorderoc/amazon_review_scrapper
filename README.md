# Amazon Review Scraper

A Chrome extension + local server that collects Amazon product reviews with one click and saves them as a structured JSON file in your Downloads folder — ready for analysis.

---

## Prerequisites

- **Chrome** 120 or newer
- **Python** 3.13 or newer
- **uv** (Python package manager — installed in step 3 below)

---

## Install

1. **Clone the repo and enter the folder**

   ```sh
   git clone <repo-url>
   cd amazon_review_scrapper
   ```

2. **Install `uv`** (skip if already installed)

   ```sh
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

   Then open a new terminal so `uv` is on your PATH.

3. **Start the server** (keep this terminal open while scraping)

   ```sh
   ./start-server.sh
   ```

   You should see: `Starting Amazon Review Scraper server on http://localhost:8765 ...`

4. **Load the Chrome extension**
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked** and select the `src/extension/` folder inside this repo

---

## Usage

1. Navigate to any Amazon product page — either `amazon.com/dp/{ASIN}` or `amazon.com/product-reviews/{ASIN}`
2. Click the orange star (★) icon in your Chrome toolbar
3. Optionally configure which star ratings to collect and the max number of pages per rating
4. Click **Scrape this product**
5. Wait for the popup to show **Done** — the extension scrapes all selected stars and pages automatically

---

## Output

When the scrape finishes, Chrome saves **`{ASIN}.json`** to your `~/Downloads/` folder automatically.

You can also access the data from the terminal:

```sh
# List all scraped products
uv run main.py list

# Show a summary for a specific product
uv run main.py show --asin B009LI7VRC
```

---

## Troubleshooting

**"Server HTTP 500" or "is the server running?" in the popup**
→ The local server is not running. Open a terminal, go to the repo folder, and run `./start-server.sh`. Leave that terminal open.

**Amazon shows a CAPTCHA**
→ The extension will report a CAPTCHA error. Switch to the Amazon tab that the extension opened, solve the CAPTCHA, then click **Scrape again** in the popup.

**Extension won't load / no star icon in toolbar**
→ Make sure **Developer mode** is enabled in `chrome://extensions`, then try **Load unpacked** again and select the `src/extension/` folder.
