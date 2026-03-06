// Review extraction from live Amazon tabs.
// extractReviews uses files: injection so the logic lives in review-extractor.js
// (testable in isolation with Jest + jsdom).
// extractHtml is retained for developer/debug use only.

// Extract reviews from the live DOM of an open tab.
// Returns { asin, reviews[], hasCaptcha, hasLoginWall, isWrongPage, _url, _title }.
// Delegates all DOM logic to review-extractor.js via files: injection.
// Retries once (after 2 s) if executeScript fails.
export function extractReviews(tabId) {
  return new Promise((resolve, reject) => {
    function attempt(isRetry) {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ["locales.js", "review-extractor.js"],
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]?.result) {
            if (!isRetry) {
              setTimeout(() => attempt(true), 2000);
            } else {
              reject(new Error(chrome.runtime.lastError?.message ?? "executeScript returned no result"));
            }
          } else {
            resolve(results[0].result);
          }
        }
      );
    }
    attempt(false);
  });
}

// Extract the current HTML and URL from an open tab via content script injection.
// Retained for developer/debug use; not called by startScrape.
// Retries once (after 2 s) if executeScript fails.
export function extractHtml(tabId) {
  return new Promise((resolve, reject) => {
    function attempt(isRetry) {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => ({ url: window.location.href, html: document.documentElement.outerHTML }),
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]?.result) {
            if (!isRetry) {
              setTimeout(() => attempt(true), 2000);
            } else {
              reject(new Error(chrome.runtime.lastError?.message ?? "executeScript returned no result"));
            }
          } else {
            resolve(results[0].result);
          }
        }
      );
    }
    attempt(false);
  });
}
