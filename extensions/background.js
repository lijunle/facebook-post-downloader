/**
 * MV3 service worker: receives download requests from content script.
 */

/**
 * @typedef {import("./types").AppMessage} AppMessage
 * @typedef {import("./types").ChromeMessageToggle} ChromeMessageToggle
 * @typedef {import("./types").ChromeMessageDownloadComplete} ChromeMessageDownloadComplete
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * @typedef {{ storyId: string, url: string, filename: string, tabId: number | undefined }} DownloadItem
 */

/** @type {Map<number, DownloadItem>} */
const activeDownloadItems = new Map();

/**
 * Resets the active downloads (for testing).
 */
export function resetQueue() {
  activeDownloadItems.clear();
}

/**
 * Downloads a file with retry mechanism.
 * @param {string} storyId - The story ID.
 * @param {string} url - The URL to download.
 * @param {string} filename - The filename to save as.
 * @param {number | undefined} tabId - The tab ID to notify on completion.
 * @param {number} [attempt=1] - Current attempt number.
 */
export function downloadFile(storyId, url, filename, tabId, attempt = 1) {
  /** @type {DownloadItem} */
  const item = { storyId, url, filename, tabId };
  chrome.downloads.download(
    {
      url: item.url,
      filename: item.filename,
      conflictAction: "overwrite",
      saveAs: false,
    },
    (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        console.error(
          `Download failed (attempt ${attempt}/${MAX_RETRIES}):`,
          chrome.runtime.lastError?.message || "Unknown error",
        );
        if (attempt < MAX_RETRIES) {
          setTimeout(
            () => downloadFile(storyId, url, filename, tabId, attempt + 1),
            RETRY_DELAY_MS,
          );
        } else {
          console.error(
            `Download failed after ${MAX_RETRIES} attempts: ${item.filename}`,
          );
        }
      } else {
        activeDownloadItems.set(downloadId, item);
      }
    },
  );
}

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === "complete") {
    const item = activeDownloadItems.get(delta.id);
    if (item) {
      activeDownloadItems.delete(delta.id);
      if (item.tabId) {
        /** @type {ChromeMessageDownloadComplete} */
        const message = {
          type: "FPDL_DOWNLOAD_COMPLETE",
          storyId: item.storyId,
          url: item.url,
          filename: item.filename,
        };
        chrome.tabs.sendMessage(item.tabId, message);
      }
    }
  }
});

/**
 * Updates the extension badge with the story count.
 * @param {number} count - The number of stories to display.
 * @param {number | undefined} tabId - The tab ID to update the badge for.
 */
export function updateBadge(count, tabId) {
  if (!tabId) return;
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#4267B2", tabId });
}

chrome.runtime.onMessage.addListener(
  (/** @type {AppMessage} */ msg, sender) => {
    if (msg.type === "FPDL_STORY_COUNT") {
      updateBadge(msg.count, sender.tab?.id);
    } else if (msg.type === "FPDL_DOWNLOAD") {
      downloadFile(msg.storyId, msg.url, msg.filename, sender.tab?.id);
    }
  },
);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    /** @type {ChromeMessageToggle} */
    const message = { type: "FPDL_TOGGLE" };
    chrome.tabs.sendMessage(tab.id, message);
  }
});
