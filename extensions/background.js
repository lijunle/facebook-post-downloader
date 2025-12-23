/**
 * MV3 service worker: receives download requests from content script.
 */

/**
 * @typedef {import("./types").AppMessage} AppMessage
 * @typedef {import("./types").ChromeMessageToggle} ChromeMessageToggle
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
                }
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
            const { url, filename } = msg;
            downloadWithRetry(url, filename);
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
