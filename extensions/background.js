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
const MAX_CONCURRENT_DOWNLOADS = 5;

/**
 * @typedef {{ storyId: string, url: string, filename: string, tabId: number | undefined }} DownloadItem
 */

/** @type {DownloadItem[]} */
const downloadQueue = [];
let activeDownloads = 0;

/**
 * Resets the download queue and active downloads counter (for testing).
 */
function resetQueue() {
    downloadQueue.length = 0;
    activeDownloads = 0;
}

/**
 * Adds a download to the queue and processes it.
 * @param {string} storyId - The story ID.
 * @param {string} url - The URL to download.
 * @param {string} filename - The filename to save as.
 * @param {number | undefined} tabId - The tab ID to notify on completion.
 */
function queueDownload(storyId, url, filename, tabId) {
    downloadQueue.push({ storyId, url, filename, tabId });
    processQueue();
}

/**
 * Processes the download queue, starting downloads up to the concurrency limit.
 */
function processQueue() {
    while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
        const item = downloadQueue.shift();
        if (item) {
            activeDownloads++;
            downloadWithRetry(item);
        }
    }
}

/**
 * Called when a download completes (success or final failure).
 * @param {DownloadItem} item - The completed download item.
 */
function onDownloadComplete(item) {
    activeDownloads--;
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
    processQueue();
}

/**
 * Downloads a file with retry mechanism.
 * @param {DownloadItem} item - The download item.
 * @param {number} [attempt=1] - Current attempt number.
 */
function downloadWithRetry(item, attempt = 1) {
    chrome.downloads.download(
        {
            url: item.url,
            filename: item.filename,
            conflictAction: "overwrite",
            saveAs: false,
        },
        (downloadId) => {
            if (chrome.runtime.lastError || downloadId === undefined) {
                console.error(`Download failed (attempt ${attempt}/${MAX_RETRIES}):`, chrome.runtime.lastError?.message || "Unknown error");
                if (attempt < MAX_RETRIES) {
                    setTimeout(() => downloadWithRetry(item, attempt + 1), RETRY_DELAY_MS);
                } else {
                    console.error(`Download failed after ${MAX_RETRIES} attempts: ${item.filename}`);
                    onDownloadComplete(item);
                }
            } else {
                onDownloadComplete(item);
            }
        }
    );
}

chrome.runtime.onMessage.addListener(
    (/** @type {AppMessage} */ msg, sender) => {
        if (msg.type === "FPDL_STORY_COUNT") {
            const text = msg.count > 0 ? String(msg.count) : "";
            if (sender.tab?.id) {
                chrome.action.setBadgeText({ text, tabId: sender.tab.id });
                chrome.action.setBadgeBackgroundColor({ color: "#4267B2", tabId: sender.tab.id });
            }
        } else if (msg.type === "FPDL_DOWNLOAD") {
            queueDownload(msg.storyId, msg.url, msg.filename, sender.tab?.id);
        }
    }
);

chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        /** @type {ChromeMessageToggle} */
        const message = { type: "FPDL_TOGGLE" };
        chrome.tabs.sendMessage(tab.id, message);
    }
});

// Export for testing (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { queueDownload, resetQueue };
}
