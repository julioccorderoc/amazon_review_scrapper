// Service worker entry point — Chrome event wiring only.
// All business logic lives in the imported modules.

import { startScrape, extractAsin } from "./scraper.js";
import { setTabIcon } from "./icons.js";

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
