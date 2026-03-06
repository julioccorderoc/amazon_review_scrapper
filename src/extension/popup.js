chrome.storage.local.get("lastResult", ({ lastResult }) => {
  const el = document.getElementById("content");

  if (!lastResult) {
    el.innerHTML = '<p class="muted">No ingestion yet — navigate to an Amazon review page.</p>';
    return;
  }

  if (lastResult.error) {
    el.innerHTML = `
      <p class="error">&#x26A0; ${lastResult.error}</p>
      <p class="muted">Make sure the server is running:<br><code>uv run main.py serve</code></p>
    `;
    return;
  }

  const ago = formatAgo(lastResult.ts);
  el.innerHTML = `
    <div class="row"><span class="label">ASIN</span><span class="value">${lastResult.asin ?? "—"}</span></div>
    <div class="row"><span class="label">Added this visit</span><span class="value ok">+${lastResult.added}</span></div>
    <div class="row"><span class="label">Total stored</span><span class="value">${lastResult.total}</span></div>
    <p class="muted">Last updated ${ago}</p>
  `;
});

function formatAgo(ts) {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}
