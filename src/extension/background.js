// Service worker: on START_SCRAPE message from the popup, fetches all Amazon
// review pages for the target ASIN and extracts reviews directly from the DOM.
// Progress is written to chrome.storage.local so the popup can poll it.

const STARS = ["one", "two", "three", "four", "five"];
const DEFAULT_MAX_PAGES = 5;
// How long to wait after a tab loads for Amazon's JS to render page 1's reviews.
// Amazon always embeds page 1 in the initial static HTML; subsequent pages are
// loaded asynchronously when the user clicks "Next" — so we simulate that click
// and poll the DOM for the first review ID change rather than using a fixed delay.
const TAB_SETTLE_MS = 1500; // page-1 initial settle only; pages 2+ use DOM polling

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(minMs, maxMs) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
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
// Retries once (after 2 s) if executeScript fails.
function extractHtml(tabId) {
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

// Click the "Next page" button on Amazon's review pagination bar.
// Returns true if the button was found and clicked; false if there is no next page.
// Retries once (after 2 s) if executeScript fails.
function clickNextPage(tabId) {
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
function waitForReviewsToChange(tabId, prevId, maxWaitMs = 5000) {
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

// Extract reviews from the live DOM of an open tab.
// Returns { asin, reviews[], hasCaptcha }.
// Port of src/parsers/html_parser.py → _parse_review_li.
// Retries once (after 2 s) if executeScript fails.
function extractReviews(tabId) {
  return new Promise((resolve, reject) => {
    function attempt(isRetry) {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            function normalize(text) {
              return text.replace(/\s+/g, " ").trim();
            }

            const asinMatch = window.location.href.match(/\/product-reviews\/([A-Z0-9]{10})/);
            const asin = asinMatch ? asinMatch[1] : null;
            const scrapedAt = new Date().toISOString();
            const reviews = [];

            for (const li of document.querySelectorAll('li[data-hook="review"]')) {
              const review_id = li.id || "";
              if (!review_id) continue;

              // reviewer_name
              const nameEl = li.querySelector(".a-profile-name");
              const reviewer_name = nameEl ? normalize(nameEl.textContent) : "";
              if (!reviewer_name) continue;

              // rating: prefer span.a-icon-alt text; fallback to CSS class a-star-N
              let rating = 1.0;
              const ratingAltEl = li.querySelector('[data-hook="review-star-rating"] span.a-icon-alt');
              if (ratingAltEl) {
                const m = normalize(ratingAltEl.textContent).match(/([\d.]+)\s+out of/);
                if (m) rating = parseFloat(m[1]);
              } else {
                const starEl = li.querySelector('[data-hook="review-star-rating"]');
                if (starEl) {
                  for (const cls of starEl.classList) {
                    const m = cls.match(/^a-star-(\d)$/);
                    if (m) { rating = parseFloat(m[1]); break; }
                  }
                }
              }

              // title: first direct-child span (not hidden) with non-empty normalized text
              let title = "";
              for (const span of li.querySelectorAll('[data-hook="review-title"] > span:not(.aok-hidden)')) {
                const t = normalize(span.textContent);
                if (t) { title = t; break; }
              }
              if (!title) continue;

              // body: prefer span inside review-body; fallback to review-body itself
              // Use innerText to preserve line breaks; do NOT normalize
              const bodyEl = li.querySelector('[data-hook="review-body"] span') ||
                             li.querySelector('[data-hook="review-body"]');
              const body = bodyEl ? bodyEl.innerText.trim() : "";
              if (!body) continue;

              // date & country
              const dateEl = li.querySelector('[data-hook="review-date"]');
              if (!dateEl) continue;
              const dateText = normalize(dateEl.textContent);
              const dateMatch = dateText.match(/Reviewed in (.+?) on (.+)/);
              if (!dateMatch) continue;
              const country = dateMatch[1].trim();
              const parsedDate = new Date(dateMatch[2].trim());
              if (isNaN(parsedDate.getTime())) continue;
              const date = parsedDate.toISOString().slice(0, 10);

              // verified_purchase
              const verified_purchase = !!li.querySelector('[data-hook="avp-badge"]');

              // helpful_votes
              let helpful_votes = 0;
              const helpfulEl = li.querySelector('[data-hook="helpful-vote-statement"]');
              if (helpfulEl) {
                const hm = normalize(helpfulEl.textContent).match(/^(\d+|[Oo]ne)\s+(?:people?|person)\s+found/i);
                if (hm) {
                  helpful_votes = hm[1].toLowerCase() === "one" ? 1 : parseInt(hm[1], 10);
                }
              }

              reviews.push({
                review_id,
                reviewer_name,
                rating,
                title,
                body,
                date,
                country,
                verified_purchase,
                helpful_votes,
                scraped_at: scrapedAt,
              });
            }

            const hasCaptcha = reviews.length === 0 &&
              document.body.textContent.includes("Enter the characters you see below");

            return { asin: asin ?? null, reviews, hasCaptcha };
          },
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

  const allReviews = new Map();
  let totalAdded = 0;
  let captchaError = null;
  let firstStar = true;

  try {
    for (const star of starsToScrape) {
      if (!firstStar) await jitter(1000, 3000);
      firstStar = false;
      if (captchaError) break;

      // One tab per star filter. Amazon loads reviews via AJAX when "Next" is clicked,
      // so we open page 1 and programmatically click "Next" for subsequent pages.
      // Navigating directly to ?pageNumber=N has no effect — Amazon always returns
      // page 1 content in the initial HTML regardless of the pageNumber parameter.
      const reviewUrl = `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_arp_d_viewopt_sr?ie=UTF8&reviewerType=all_reviews&filterByStar=${star}_star`;
      console.log(`[ARS] star=${star}: opening tab → ${reviewUrl}`);

      let scrapeTabId = null;
      let prevFirstId = null; // reset per star filter

      try {
        scrapeTabId = await openTabAndLoad(reviewUrl);

        for (let page = 1; page <= maxPages; page++) {
          if (page === 1) {
            // After initial load, wait for Amazon's JS to render page 1's reviews.
            await sleep(TAB_SETTLE_MS);
          }
          // Pages 2+: waitForReviewsToChange already resolved at the end of the previous iteration.

          const { reviews, hasCaptcha } = await extractReviews(scrapeTabId);
          const hasReviews = reviews.length > 0;
          console.log(`[ARS] star=${star} page=${page} reviews=${reviews.length} hasCaptcha=${hasCaptcha}`);

          // CAPTCHA detection
          if (hasCaptcha) {
            captchaError = "Amazon showed a CAPTCHA. Please open a tab, solve it at amazon.com, then re-scrape.";
            break;
          }

          // Capture first review ID for cycle detection and DOM polling
          const currentFirstId = reviews[0]?.review_id ?? null;
          console.log(`[ARS] prevFirstId=${prevFirstId}`);
          if (prevFirstId !== null && currentFirstId === prevFirstId) {
            console.log(`[ARS] star=${star} page=${page}: cycle detected, stopping`);
            break;
          }
          prevFirstId = currentFirstId;

          // Accumulate (Map.set deduplicates by review_id)
          const sizeBefore = allReviews.size;
          for (const r of reviews) allReviews.set(r.review_id, r);
          totalAdded += allReviews.size - sizeBefore;

          await chrome.storage.local.set({ status: "running", star, page, added: totalAdded, asin });

          if (!hasReviews) break;

          if (page < maxPages) {
            // Advance to the next page by clicking Amazon's "Next" button in the tab.
            const clicked = await clickNextPage(scrapeTabId);
            console.log(`[ARS] clickNext=${clicked}`);
            if (!clicked) break; // "Next" is absent or disabled → no more pages.

            // Wait for Amazon's AJAX to update the DOM with the next page's reviews.
            const reason = await waitForReviewsToChange(scrapeTabId, prevFirstId);
            console.log(`[ARS] reviews settled: reason=${reason}`);
          }
        }
      } catch (starErr) {
        console.error(`[ARS] star=${star} failed:`, starErr.message);
      } finally {
        if (scrapeTabId !== null) {
          chrome.tabs.remove(scrapeTabId, () => void chrome.runtime.lastError);
        }
      }
    }

    if (captchaError) {
      await chrome.storage.local.set({ status: "error", error: captchaError, asin });
      chrome.action.setBadgeText({ text: "err", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#f44336", tabId });
      return;
    }

    await chrome.storage.local.set({
      status: "done",
      asin,
      totalAdded: allReviews.size,
      ts: Date.now(),
    });
    chrome.action.setBadgeText({ text: String(allReviews.size), tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId });

    chrome.downloads.download({
      url: "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify([...allReviews.values()], null, 2)),
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
