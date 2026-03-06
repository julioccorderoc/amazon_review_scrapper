// Capture the full page HTML and hand it off to the background service worker,
// which has host_permissions to POST to localhost without CORS restrictions.
console.log("[ARS] content script fired on", window.location.href);
chrome.runtime.sendMessage(
  { type: "INGEST_HTML", html: document.documentElement.outerHTML },
  (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[ARS] sendMessage failed:", chrome.runtime.lastError.message);
    } else {
      console.log("[ARS] background acknowledged:", response);
    }
  }
);
