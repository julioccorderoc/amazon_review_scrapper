// Service worker: on START_SCRAPE message from the popup, fetches all Amazon
// review pages for the target ASIN and posts each to the local ingest server.
// Progress is written to chrome.storage.local so the popup can poll it.

const SERVER = "http://localhost:8765";
const STARS = ["one", "two", "three", "four", "five"];
const DEFAULT_MAX_PAGES = 5;
// How long to wait after a tab loads (or after clicking "Next") for Amazon's
// AJAX to finish rendering the correct page's reviews into the DOM.
// Amazon always embeds page 1 in the initial static HTML; subsequent pages are
// loaded asynchronously when the user clicks "Next" — so we simulate that click
// and wait for the DOM update rather than navigating to ?pageNumber=N directly.
const TAB_SETTLE_MS = 3000;

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

// Open a new background tab and resolve with its tabId once it reaches "complete".
function openTabAndLoad(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      const tabId = tab.id;

      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
        reject(new Error(`Timeout opening ${url}`));
      }, 30_000);

      function onUpdated(tId, changeInfo) {
        if (tId !== tabId || changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timeout);
        resolve(tabId);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// Extract the current HTML and URL from an open tab via content script injection.
function extractHtml(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => ({ url: window.location.href, html: document.documentElement.outerHTML }),
      },
      (results) => {
        if (chrome.runtime.lastError || !results?.[0]?.result) {
          reject(new Error(chrome.runtime.lastError?.message ?? "executeScript returned no result"));
        } else {
          resolve(results[0].result);
        }
      }
    );
  });
}

// Click the "Next page" button on Amazon's review pagination bar.
// Returns true if the button was found and clicked; false if there is no next page.
function clickNextPage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          // Amazon's "Next" link: the last <li> in .a-pagination that isn't disabled.
          const next = document.querySelector(".a-pagination li.a-last:not(.a-disabled) a");
          if (next) { next.click(); return true; }
          return false;
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(results?.[0]?.result ?? false);
        }
      }
    );
  });
}

// Draw a 32×32 icon via OffscreenCanvas.
// active=true → orange (valid Amazon product page), false → grey (anywhere else).
function drawTabIcon(active) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#FF9900" : "#AAAAAA";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.round(size * 0.55)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", size / 2, size / 2 + 1);
  return ctx.getImageData(0, 0, size, size);
}

function setTabIcon(tabId, active) {
  try {
    chrome.action.setIcon({ imageData: drawTabIcon(active), tabId });
  } catch (e) {
    // OffscreenCanvas unavailable — default icon is used
  }
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

async function startScrape(url, tabId) {
  const asin = extractAsin(url);
  if (!asin) {
    chrome.storage.local.set({
      status: "error",
      error: "No ASIN found. Navigate to amazon.com/dp/{ASIN} or /product-reviews/{ASIN}.",
    });
    chrome.action.setBadgeText({ text: "?", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#ff9800", tabId });
    return;
  }

  // Guard: don't start a second scrape while one is already running.
  const { status } = await chrome.storage.local.get("status");
  if (status === "running") return;

  const { maxPages: storedMax, selectedStars: storedStars } =
    await chrome.storage.local.get(["maxPages", "selectedStars"]);
  const maxPages =
    typeof storedMax === "number" && storedMax > 0 ? storedMax : DEFAULT_MAX_PAGES;
  const starsToScrape =
    Array.isArray(storedStars) && storedStars.length > 0 ? storedStars : STARS;

  chrome.action.setBadgeText({ text: "…", tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#2196F3", tabId });

  let totalAdded = 0;
  let lastTotal = 0;

  try {
    for (const star of starsToScrape) {
      // One tab per star filter. Amazon loads reviews via AJAX when "Next" is clicked,
      // so we open page 1 and programmatically click "Next" for subsequent pages.
      // Navigating directly to ?pageNumber=N has no effect — Amazon always returns
      // page 1 content in the initial HTML regardless of the pageNumber parameter.
      const reviewUrl = `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_arp_d_viewopt_sr?ie=UTF8&reviewerType=all_reviews&filterByStar=${star}_star`;
      console.log(`[ARS] star=${star}: opening tab → ${reviewUrl}`);

      let scrapeTabId = null;
      try {
        scrapeTabId = await openTabAndLoad(reviewUrl);

        for (let page = 1; page <= maxPages; page++) {
          await chrome.storage.local.set({ status: "running", star, page, added: totalAdded, asin });

          if (page === 1) {
            // After initial load, wait for Amazon's JS to render page 1's reviews.
            await sleep(TAB_SETTLE_MS);
          }
          // Pages 2+: the TAB_SETTLE_MS wait already happened after the last clickNextPage call.

          const { url: actualUrl, html } = await extractHtml(scrapeTabId);
          const hasReviews = html.includes('data-hook="review"');
          console.log(`[ARS] star=${star} page=${page} url=${actualUrl} html_len=${html.length} hasReviews=${hasReviews}`);

          const result = await postToServer(html);
          console.log(`[ARS] server: asin=${result.asin} added=${result.added} total=${result.total}`);

          if (result.added > 0) totalAdded += result.added;
          if (result.total) lastTotal = result.total;

          // No reviews found → empty page or CAPTCHA → stop this star filter.
          if (result.asin === null) break;

          if (page < maxPages) {
            // Advance to the next page by clicking Amazon's "Next" button in the tab.
            const clicked = await clickNextPage(scrapeTabId);
            console.log(`[ARS] clickNext=${clicked}`);
            if (!clicked) break; // "Next" is absent or disabled → no more pages.

            // Wait for the AJAX update to populate the next page's reviews.
            await sleep(TAB_SETTLE_MS);
          }
        }
      } finally {
        if (scrapeTabId !== null) {
          chrome.tabs.remove(scrapeTabId, () => void chrome.runtime.lastError);
        }
      }
    }

    await chrome.storage.local.set({
      status: "done",
      asin,
      totalAdded,
      total: lastTotal,
      ts: Date.now(),
    });
    chrome.action.setBadgeText({ text: String(totalAdded), tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId });

    // Trigger download of the aggregated JSON to ~/Downloads/
    chrome.downloads.download({
      url: `${SERVER}/output/${asin}`,
      filename: `${asin}.json`,
      saveAs: false,
    });
  } catch (err) {
    console.error("[ARS] scrape failed:", err.message);
    await chrome.storage.local.set({ status: "error", error: err.message, asin });
    chrome.action.setBadgeText({ text: "err", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#f44336", tabId });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "START_SCRAPE") return;
  startScrape(msg.url, msg.tabId); // fire and forget; popup polls storage for progress
});

// When a tab starts navigating: clear its badge.
// When it finishes loading: update the icon colour (orange = valid product page, grey = other).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
  if (changeInfo.status === "complete") {
    setTabIcon(tabId, !!extractAsin(tab.url || ""));
  }
});

// When the user switches to a different tab: update the icon for that tab immediately.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    setTabIcon(tabId, !!extractAsin(tab.url || ""));
  } catch (e) {
    // Tab may have been closed between the event and the get() call.
  }
});
