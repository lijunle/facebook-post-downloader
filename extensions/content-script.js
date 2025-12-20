(function () {
    /**
     * @param {unknown} value
     * @returns {value is (import("./types").FpdlDownloadMessage & { __fpdl: true })}
     */
    function isDownloadMessageData(value) {
        if (!value || typeof value !== "object") return false;
        /** @type {Record<string, unknown>} */
        const obj = /** @type {Record<string, unknown>} */ (value);
        return (
            obj.__fpdl === true &&
            obj.type === "FPDL_DOWNLOAD" &&
            typeof obj.url === "string" &&
            typeof obj.filename === "string"
        );
    }

    /**
     * Injects app.js into the page context.
     *
     * @returns {void}
     */
    function injectAppScript() {
        const markerId = "fpdl-app-script";
        if (document.getElementById(markerId)) return;

        const script = document.createElement("script");
        script.id = markerId;
        script.type = "module";

        try {
            script.src = chrome.runtime.getURL("extensions/app.js");
            script.onload = () => {
                script.remove();
            };
            script.onerror = (e) => {
                console.warn("[fpdl] Failed to load app.js via script.src", e);
            };
            document.documentElement.appendChild(script);
        } catch (err) {
            console.warn("[fpdl] Failed to inject app.js", err);
        }
    }

    injectAppScript();

    // Forward toggle messages from background to page context
    chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === 'FPDL_TOGGLE') {
            window.postMessage({ __fpdl: true, type: 'FPDL_TOGGLE' }, window.location.origin);
        }
    });

    // Bridge download requests from page-world UI to the extension background.
    window.addEventListener("message", (event) => {
        try {
            if (event.source !== window) return;

            const data = event.data;
            if (!data || typeof data !== "object" || !data.__fpdl) return;

            if (data.type === "FPDL_STORY_COUNT" && typeof data.count === "number") {
                chrome.runtime.sendMessage({ type: "FPDL_STORY_COUNT", count: data.count });
            } else if (isDownloadMessageData(data)) {
                const { url, filename } = data;

                /** @type {import("./types").FpdlDownloadMessage} */
                const message = { type: "FPDL_DOWNLOAD", url, filename };

                chrome.runtime.sendMessage(message);
            }
        } catch (err) {
            console.warn("[fpdl] download bridge failed", err);
        }
    });
})();
