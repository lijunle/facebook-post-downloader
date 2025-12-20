/**
 * MV3 service worker: receives download requests from content script.
 */

/**
 * @typedef {import("./types").AppMessage} AppMessage
 * @typedef {import("./types").ChromeMessageToggle} ChromeMessageToggle
 */

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
            chrome.downloads.download(
                {
                    url,
                    filename,
                    conflictAction: "overwrite",
                    saveAs: false,
                });
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
