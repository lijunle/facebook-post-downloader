/**
 * MV3 service worker: receives download requests from content script.
 */

/**
 * @typedef {import("./types").FpdlDownloadMessage} FpdlDownloadMessage
 * @typedef {import("./types").FpdlDownloadResponse} FpdlDownloadResponse
 */

/**
 * @param {unknown} value
 * @returns {value is FpdlDownloadMessage}
 */
function isDownloadMessage(value) {
    if (!value || typeof value !== "object") return false;
    /** @type {Record<string, unknown>} */
    const obj = /** @type {Record<string, unknown>} */ (value);
    return (
        obj.type === "FPDL_DOWNLOAD" &&
        typeof obj.url === "string" &&
        /^(https?|data):/i.test(obj.url) &&
        typeof obj.filename === "string" &&
        !!obj.filename.trim()
    );
}

/**
 * @param {unknown} msg
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(resp: FpdlDownloadResponse) => void} sendResponse
 * @returns {true | void}
 */
function onMessage(msg, _sender, sendResponse) {
    try {
        if (!isDownloadMessage(msg)) return;

        const { url, filename } = msg;

        chrome.downloads.download(
            {
                url,
                filename,
                conflictAction: "overwrite",
                saveAs: false,
            },
            (downloadId) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    sendResponse({ ok: false, error: String(err.message || err) });
                } else if (typeof downloadId !== "number") {
                    sendResponse({ ok: false, error: "Download failed" });
                } else {
                    sendResponse({ ok: true, downloadId });
                }
            },
        );

        // Keep the message channel open for async sendResponse.
        return true;
    } catch (e) {
        sendResponse({ ok: false, error: String(e) });
        return;
    }
}

chrome.runtime.onMessage.addListener(onMessage);
