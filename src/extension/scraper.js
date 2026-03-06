// Scrape orchestrator: one tab per star filter, click-based pagination.
// Exports extractAsin (also used by background.js for tab icon updates).

import { jitter, openTabAndLoad, clickNextPage, waitForReviewsToChange, waitForReviewsToAppear } from "./tab-utils.js";
import { setTabIcon } from "./icons.js";
import { extractReviews } from "./extractor.js";

const STARS = ["one", "two", "three", "four", "five"];
const DEFAULT_MAX_PAGES = 5;

export function extractAsin(url) {
  if (!url) return null;
  let m = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (m) return m[1];
  m = url.match(/\/product-reviews\/([A-Z0-9]{10})/);
  if (m) return m[1];
  return null;
}

export async function startScrape(url, tabId) {
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
            // Poll until at least one review element appears (up to 8 s).
            // Chrome fires tab status "complete" when the network request finishes,
            // but Amazon then renders reviews via client-side JS — a fixed sleep
            // is unreliable across machines and network speeds.
            const settleReason = await waitForReviewsToAppear(scrapeTabId);
            console.log(`[ARS] page 1 settle: ${settleReason}`);
          }
          // Pages 2+: waitForReviewsToChange already resolved at the end of the previous iteration.

          const { reviews, hasCaptcha, hasLoginWall, isWrongPage, _url, _title } = await extractReviews(scrapeTabId);
          const hasReviews = reviews.length > 0;
          console.log(`[ARS] star=${star} page=${page} reviews=${reviews.length} hasCaptcha=${hasCaptcha} hasLoginWall=${hasLoginWall} isWrongPage=${isWrongPage} url=${_url} title=${_title}`);

          // CAPTCHA detection
          if (hasCaptcha) {
            captchaError = "Amazon showed a CAPTCHA. Please open a tab, solve it at amazon.com, then re-scrape.";
            break;
          }

          // Login wall: Amazon requires sign-in to see reviews
          if (hasLoginWall) {
            captchaError = "Amazon requires you to be signed in to see all reviews. Please log in to Amazon in Chrome, then scrape again.";
            console.warn(`[ARS] Login wall on star=${star} page=${page}: ${_url}`);
            break;
          }

          // Wrong page: geo-redirect (VPN), maintenance page, or similar
          if (isWrongPage) {
            captchaError = `Amazon redirected to an unexpected page: ${_url} — If you are using a VPN, try disabling it and scraping again.`;
            console.warn(`[ARS] Wrong page on star=${star} page=${page}: title="${_title}" url=${_url}`);
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
