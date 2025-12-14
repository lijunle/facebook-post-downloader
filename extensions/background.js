// @ts-check

/**
 * MV3 service worker: receives download requests from content script.
 */

/** @type {any} */
const chromeAny = /** @type {any} */ (globalThis).chrome;

/**
 * @param {any} msg
 * @param {any} _sender
 * @param {(resp: any) => void} sendResponse
 */
function onMessage(msg, _sender, sendResponse) {
    try {
        if (!msg || typeof msg !== "object") return;
        if (msg.type !== "FPDL_DOWNLOAD") return;

        const url = msg.url;
        const filename = msg.filename;

        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
            sendResponse({ ok: false, error: "Invalid url" });
            return;
        }
        if (typeof filename !== "string" || !filename.trim()) {
            sendResponse({ ok: false, error: "Invalid filename" });
            return;
        }

        chromeAny.downloads.download(
            {
                url,
                filename,
                conflictAction: "overwrite",
                saveAs: false,
            },
            (/** @type {any} */ downloadId) => {
                const err = chromeAny.runtime.lastError;
                if (err) {
                    sendResponse({ ok: false, error: String(err.message || err) });
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

if (chromeAny && chromeAny.runtime && chromeAny.runtime.onMessage) {
    chromeAny.runtime.onMessage.addListener(onMessage);
}
