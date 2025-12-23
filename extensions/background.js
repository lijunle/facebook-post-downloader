/**
 * MV3 service worker: receives download requests from content script.
 */

/**
 * @typedef {import("./types").AppMessage} AppMessage
 * @typedef {import("./types").AppMessageDownload} AppMessageDownload
 * @typedef {import("./types").ChromeMessageToggle} ChromeMessageToggle
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_CONCURRENT_DOWNLOADS = 5;

/** @type {AppMessageDownload[]} */
const downloadQueue = [];
let activeDownloads = 0;

/**
 * Resets the download queue and active downloads counter (for testing).
 */
export function resetQueue() {
    downloadQueue.length = 0;
    activeDownloads = 0;
}

/**
 * Adds a download to the queue and processes it.
 * @param {AppMessageDownload} message - The download message.
 */
export function queueDownload(message) {
    downloadQueue.push(message);
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
            downloadWithRetry(item.url, item.filename);
        }
    }
}

/**
 * Called when a download completes (success or final failure).
 */
function onDownloadComplete() {
    activeDownloads--;
    processQueue();
}

/**
 * Downloads a file with retry mechanism.
 * @param {string} url - The URL to download.
 * @param {string} filename - The filename to save as.
 * @param {number} [attempt=1] - Current attempt number.
 */
function downloadWithRetry(url, filename, attempt = 1) {
    chrome.downloads.download(
        {
            url,
            filename,
            conflictAction: "overwrite",
            saveAs: false,
        },
        (downloadId) => {
            if (chrome.runtime.lastError || downloadId === undefined) {
                console.error(`Download failed (attempt ${attempt}/${MAX_RETRIES}):`, chrome.runtime.lastError?.message || "Unknown error");
                if (attempt < MAX_RETRIES) {
                    setTimeout(() => downloadWithRetry(url, filename, attempt + 1), RETRY_DELAY_MS);
                } else {
                    console.error(`Download failed after ${MAX_RETRIES} attempts: ${filename}`);
                    onDownloadComplete();
                }
            } else {
                onDownloadComplete();
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
            queueDownload(msg);
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
