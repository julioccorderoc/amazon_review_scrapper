// Service worker: on START_SCRAPE message from the popup, fetches all Amazon
// review pages for the target ASIN and posts each to the local ingest server.
// Progress is written to chrome.storage.local so the popup can poll it.

const SERVER = "http://localhost:8765";
const STARS = ["one", "two", "three", "four", "five"];
const DEFAULT_MAX_PAGES = 5;
const DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractAsin(url) {
  if (!url) return null;
  let m = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (m) return m[1];
  m = url.match(/\/product-reviews\/([A-Z0-9]{10})/);
  if (m) return m[1];
  return null;
}

async function fetchHtml(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching review page`);
  return r.text();
}

async function postToServer(html) {
  const r = await fetch(`${SERVER}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  });
  if (!r.ok) throw new Error(`Server HTTP ${r.status} — is the server running?`);
  return r.json();
}

async function startScrape(url) {
  const asin = extractAsin(url);
  if (!asin) {
    chrome.storage.local.set({
      status: "error",
      error: "No ASIN found. Navigate to amazon.com/dp/{ASIN} or /product-reviews/{ASIN}.",
    });
    chrome.action.setBadgeText({ text: "?" });
    chrome.action.setBadgeBackgroundColor({ color: "#ff9800" });
    return;
  }

  // Guard: don't start a second scrape while one is already running.
  const { status } = await chrome.storage.local.get("status");
  if (status === "running") return;

  const { maxPages: storedMax } = await chrome.storage.local.get("maxPages");
  const maxPages =
    typeof storedMax === "number" && storedMax > 0 ? storedMax : DEFAULT_MAX_PAGES;

  chrome.action.setBadgeText({ text: "…" });
  chrome.action.setBadgeBackgroundColor({ color: "#2196F3" });

  let totalAdded = 0;
  let lastTotal = 0;

  try {
    for (const star of STARS) {
      for (let page = 1; page <= maxPages; page++) {
        await chrome.storage.local.set({
          status: "running",
          star,
          page,
          added: totalAdded,
          asin,
        });

        const reviewUrl = `https://www.amazon.com/product-reviews/${asin}?filterByStar=${star}_star&pageNumber=${page}`;
        const html = await fetchHtml(reviewUrl);
        const result = await postToServer(html);

        if (result.added > 0) totalAdded += result.added;
        if (result.total) lastTotal = result.total;

        if (result.added === 0) break; // no more pages for this star rating

        await sleep(DELAY_MS);
      }
      await sleep(DELAY_MS);
    }

    await chrome.storage.local.set({
      status: "done",
      asin,
      totalAdded,
      total: lastTotal,
      ts: Date.now(),
    });
    chrome.action.setBadgeText({ text: String(totalAdded) });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });

    // Trigger download of the aggregated JSON to ~/Downloads/
    chrome.downloads.download({
      url: `${SERVER}/output/${asin}`,
      filename: `${asin}.json`,
      saveAs: false,
    });
  } catch (err) {
    console.error("[ARS] scrape failed:", err.message);
    await chrome.storage.local.set({ status: "error", error: err.message, asin });
    chrome.action.setBadgeText({ text: "err" });
    chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "START_SCRAPE") return;
  startScrape(msg.url); // fire and forget; popup polls storage for progress
});
