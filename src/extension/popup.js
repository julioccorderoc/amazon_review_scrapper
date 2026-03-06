const STAR_LABELS = { one: "1 ★", two: "2 ★", three: "3 ★", four: "4 ★", five: "5 ★" };
const DEFAULT_MAX_PAGES = 5;

function formatAgo(ts) {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

function extractAsin(url) {
  if (!url) return null;
  let m = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (m) return m[1];
  m = url.match(/\/product-reviews\/([A-Z0-9]{10})/);
  if (m) return m[1];
  return null;
}

let currentTabUrl = null;

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) currentTabUrl = tabs[0].url || null;
});

function attachScrapeBtn() {
  const btn = document.getElementById("scrapeBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.runtime.sendMessage({ type: "START_SCRAPE", url: tabs[0].url });
      btn.disabled = true;
      btn.textContent = "Starting…";
    });
  });
}

function render(state) {
  const el = document.getElementById("content");
  const tabAsin = extractAsin(currentTabUrl);

  if (state.status === "running") {
    const star = STAR_LABELS[state.star] || state.star;
    el.innerHTML = `
      <div class="row"><span class="label">Status</span><span class="value running">Scraping…</span></div>
      <div class="row"><span class="label">Star filter</span><span class="value">${star}</span></div>
      <div class="row"><span class="label">Page</span><span class="value">${state.page}</span></div>
      <div class="row"><span class="label">Added so far</span><span class="value ok">+${state.added ?? 0}</span></div>
      ${state.asin ? `<p class="muted">ASIN: ${state.asin}</p>` : ""}
      <button id="resetBtn" style="margin-top:8px;font-size:11px;">Reset (if stuck)</button>
    `;
    document.getElementById("resetBtn").addEventListener("click", () => {
      chrome.storage.local.remove("status");
    });
    return;
  }

  if (state.status === "done") {
    const ago = state.ts ? formatAgo(state.ts) : "";
    el.innerHTML = `
      <div class="row"><span class="label">ASIN</span><span class="value">${state.asin ?? "—"}</span></div>
      <div class="row"><span class="label">Added this session</span><span class="value ok">+${state.totalAdded ?? 0}</span></div>
      <div class="row"><span class="label">Total stored</span><span class="value">${state.total ?? 0}</span></div>
      <p class="muted">Saved to ~/Downloads/${state.asin}.json · ${ago}</p>
      ${tabAsin ? `<button id="scrapeBtn" class="primary" style="width:100%;margin-top:8px;">Scrape again</button>` : ""}
    `;
    attachScrapeBtn();
    return;
  }

  if (state.status === "error") {
    el.innerHTML = `
      <p class="error">&#x26A0; ${state.error}</p>
      <p class="muted">Make sure the server is running:<br><code>uv run main.py serve</code></p>
      ${tabAsin ? `<button id="scrapeBtn" class="primary" style="width:100%;margin-top:8px;">Try again</button>` : ""}
    `;
    attachScrapeBtn();
    return;
  }

  // Idle
  el.innerHTML = tabAsin
    ? `
      <div class="row"><span class="label">ASIN</span><span class="value">${tabAsin}</span></div>
      <button id="scrapeBtn" class="primary" style="width:100%;margin-top:8px;">Scrape this product</button>
    `
    : `<p class="muted">Navigate to an Amazon product page (amazon.com/dp/… or /product-reviews/…), then click here.</p>`;
  attachScrapeBtn();
}

function refresh() {
  chrome.storage.local.get(
    ["status", "star", "page", "added", "asin", "total", "totalAdded", "ts", "error"],
    render
  );
}

refresh();
const interval = setInterval(refresh, 1000);
window.addEventListener("unload", () => clearInterval(interval));

// Settings — max pages per star
chrome.storage.local.get("maxPages", ({ maxPages }) => {
  document.getElementById("maxPages").value = maxPages ?? DEFAULT_MAX_PAGES;
});

document.getElementById("saveSettings").addEventListener("click", () => {
  const val = parseInt(document.getElementById("maxPages").value, 10);
  if (!isNaN(val) && val > 0) {
    chrome.storage.local.set({ maxPages: val });
    const btn = document.getElementById("saveSettings");
    btn.textContent = "Saved!";
    setTimeout(() => (btn.textContent = "Save"), 1500);
  }
});
