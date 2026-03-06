// Tab lifecycle utilities used by the scrape orchestrator.

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function jitter(minMs, maxMs) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

// Open a new background tab and resolve with its tabId once it reaches "complete".
export function openTabAndLoad(url) {
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

// Click the "Next page" button on Amazon's review pagination bar.
// Returns true if the button was found and clicked; false if there is no next page.
// Retries once (after 2 s) if executeScript fails.
export function clickNextPage(tabId) {
  return new Promise((resolve, reject) => {
    function attempt(isRetry) {
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
            if (!isRetry) {
              setTimeout(() => attempt(true), 2000);
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
          } else {
            resolve(results?.[0]?.result ?? false);
          }
        }
      );
    }
    attempt(false);
  });
}

// Poll every 200 ms until the first review ID changes from `prevId`,
// or until `maxWaitMs` elapses. Returns "changed" or "timeout".
// Use after clickNextPage() to know when Amazon's AJAX has finished.
export function waitForReviewsToChange(tabId, prevId, maxWaitMs = 5000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxWaitMs;

    function poll() {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            const first = document.querySelector('li[data-hook="review"]');
            return first ? first.id : null;
          },
        },
        (results) => {
          const currentId = results?.[0]?.result ?? null;
          if (currentId && currentId !== prevId) {
            resolve("changed");
          } else if (Date.now() < deadline) {
            setTimeout(poll, 200);
          } else {
            resolve("timeout");
          }
        }
      );
    }

    setTimeout(poll, 200); // first check after 200 ms
  });
}

// Poll every 300 ms until at least one review element appears in the DOM,
// or until maxWaitMs elapses. Returns "ready" or "timeout".
// Used for page 1 instead of a fixed sleep: adapts to both fast and slow
// rendering environments without over-waiting on fast machines.
export function waitForReviewsToAppear(tabId, maxWaitMs = 8000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxWaitMs;

    function poll() {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => document.querySelectorAll('li[data-hook="review"]').length,
        },
        (results) => {
          const count = results?.[0]?.result ?? 0;
          if (count > 0) {
            resolve("ready");
          } else if (Date.now() < deadline) {
            setTimeout(poll, 300);
          } else {
            resolve("timeout");
          }
        }
      );
    }

    setTimeout(poll, 300); // first check after 300 ms
  });
}
