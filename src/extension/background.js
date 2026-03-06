// Service worker: receives HTML from content scripts and POSTs it to the local
// ingest server. Updates the extension icon badge with the result.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "INGEST_HTML") return;

  const tabId = sender.tab?.id;
  console.log("[ARS] received INGEST_HTML from tab", tabId, "— html length:", msg.html.length);

  fetch("http://localhost:8765/ingest", {
    method: "POST",
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: msg.html,
  })
    .then((r) => {
      console.log("[ARS] server responded", r.status);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      console.log("[ARS] ingest result:", data);
      chrome.storage.local.set({ lastResult: { ...data, error: null, ts: Date.now() } });
      chrome.action.setBadgeText({ text: `+${data.added}`, tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId });
      sendResponse({ ok: true });
    })
    .catch((err) => {
      console.error("[ARS] fetch failed:", err.message);
      chrome.storage.local.set({ lastResult: { error: err.message, ts: Date.now() } });
      chrome.action.setBadgeText({ text: "err", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#f44336", tabId });
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep message channel open for async sendResponse
});
