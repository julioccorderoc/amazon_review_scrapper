const STAR_LABELS = { one: "1 ★", two: "2 ★", three: "3 ★", four: "4 ★", five: "5 ★" };
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_STARS = ["one", "two", "three", "four", "five"];

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

async function checkServer() {
  const banner = document.getElementById("server-banner");
  try {
    const r = await fetch("http://localhost:8765/health", { signal: AbortSignal.timeout(2000) });
    if (r.ok) { banner.style.display = "none"; return; }
  } catch (_) {}
  banner.style.display = "";
  banner.textContent = "⚠ Server is not running — open a terminal and run ./start-server.sh";
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) currentTabUrl = tabs[0].url || null;
  refresh(); // re-render now that we know the tab's ASIN
  checkServer();
});

function attachScrapeBtn() {
  const btn = document.getElementById("scrapeBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.runtime.sendMessage({ type: "START_SCRAPE", url: tabs[0].url, tabId: tabs[0].id });
      btn.disabled = true;
      btn.textContent = "Starting…";
    });
  });
}

function render(state) {
  const el = document.getElementById("content");
  const tabAsin = extractAsin(currentTabUrl);

  // If the current tab is a different product than the last stored result,
  // ignore the stale result and show idle for the new product instead.
  const staleResult = tabAsin && state.asin && tabAsin !== state.asin;

  if (state.status === "running") {
    const star = STAR_LABELS[state.star] || state.star;
    const starsArr = Array.isArray(state.selectedStars) && state.selectedStars.length > 0
      ? state.selectedStars : DEFAULT_STARS;
    const maxP = typeof state.maxPages === "number" && state.maxPages > 0 ? state.maxPages : DEFAULT_MAX_PAGES;
    const starIdx = Math.max(starsArr.indexOf(state.star), 0);
    const pagesCompleted = starIdx * maxP + Math.max((state.page ?? 1) - 1, 0);
    const totalPagesEst = starsArr.length * maxP;
    const pct = totalPagesEst > 0 ? Math.min(Math.round(pagesCompleted / totalPagesEst * 100), 99) : 0;
    el.innerHTML = `
      <div class="row"><span class="label">Status</span><span class="value running">Scraping…</span></div>
      <div class="row"><span class="label">Star filter</span><span class="value">${star}</span></div>
      <div class="row"><span class="label">Page</span><span class="value">${state.page}</span></div>
      <div style="margin:6px 0 2px;background:#eee;border-radius:4px;height:6px;overflow:hidden;">
        <div style="width:${pct}%;background:#FF9900;height:6px;transition:width 0.4s;"></div>
      </div>
      <p class="muted" style="text-align:right;margin:2px 0 6px;">${pct}%</p>
      <div class="row"><span class="label">Added so far</span><span class="value ok">+${state.added ?? 0}</span></div>
      ${state.asin ? `<p class="muted">ASIN: ${state.asin}</p>` : ""}
      <button id="resetBtn" style="margin-top:8px;font-size:11px;">Reset (if stuck)</button>
    `;
    document.getElementById("resetBtn").addEventListener("click", () => {
      chrome.storage.local.remove("status");
    });
    return;
  }

  if (!staleResult && state.status === "done") {
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

  if (!staleResult && state.status === "error") {
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
    ["status", "star", "page", "added", "asin", "total", "totalAdded", "ts", "error", "selectedStars", "maxPages"],
    render
  );
}

// Do NOT call refresh() here. The tabs.query callback above fires within ~20ms
// and calls refresh() with the correct currentTabUrl. Calling it early (before
// the tab URL is known) causes a flash of stale content because currentTabUrl
// is still null and the staleResult guard can't fire.
const interval = setInterval(() => { refresh(); checkServer(); }, 1000);
window.addEventListener("unload", () => clearInterval(interval));

// Settings — star selection (auto-save on change)
chrome.storage.local.get("selectedStars", ({ selectedStars }) => {
  const active = Array.isArray(selectedStars) && selectedStars.length > 0
    ? selectedStars
    : DEFAULT_STARS;
  document.querySelectorAll(".star-cb").forEach((cb) => {
    cb.checked = active.includes(cb.value);
  });
});

document.querySelectorAll(".star-cb").forEach((cb) => {
  cb.addEventListener("change", () => {
    const selected = [...document.querySelectorAll(".star-cb:checked")].map((c) => c.value);
    chrome.storage.local.set({ selectedStars: selected });
  });
});

// Settings — max pages per star
chrome.storage.local.get("maxPages", ({ maxPages }) => {
  document.getElementById("maxPages").value = maxPages ?? DEFAULT_MAX_PAGES;
});

// Auto-save on every keystroke so the stored value is always current.
document.getElementById("maxPages").addEventListener("input", () => {
  const val = parseInt(document.getElementById("maxPages").value, 10);
  if (!isNaN(val) && val > 0) chrome.storage.local.set({ maxPages: val });
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
