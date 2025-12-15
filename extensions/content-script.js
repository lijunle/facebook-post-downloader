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
     * Injects a script into the page context (not the isolated extension world)
     * so we can wrap the real `window.fetch` used by the page.
     *
     * @returns {void}
     */
    function injectFetchHijack() {
        const markerId = "fpdl-facebook-fetch";
        if (document.getElementById(markerId)) return;

        try {
            const script = document.createElement("script");
            script.id = markerId;
            script.type = "text/javascript";

            script.src = chrome.runtime.getURL("extensions/facebook-fetch.js");
            script.onload = () => {
                // Keep the DOM tidy; the script has already executed.
                script.remove();
            };
            script.onerror = (e) => {
                console.warn("[fpdl] Failed to load facebook-fetch.js via script.src", e);
            };
            document.documentElement.appendChild(script);
        } catch (err) {
            console.warn("[fpdl] Failed to inject facebook-fetch.js", err);
        }
    }

    /**
     * Injects the post table renderer into the page context so it can read
     * window.__fpdl_posts (a page-world global).
     *
     * @returns {void}
     */
    function injectPostTable() {
        const markerId = "fpdl-post-table";
        if (document.getElementById(markerId)) return;

        const script = document.createElement("script");
        script.id = markerId;
        script.type = "text/javascript";

        try {
            script.src = chrome.runtime.getURL("extensions/post-table.js");
            script.onload = () => {
                script.remove();
            };
            script.onerror = (e) => {
                console.warn("[fpdl] Failed to load post-table.js via script.src", e);
            };
            document.documentElement.appendChild(script);
        } catch (err) {
            console.warn("[fpdl] Failed to inject post-table.js", err);
        }
    }

    /**
     * Injects webpage-script.js into the page context.
     *
     * @returns {void}
     */
    function injectWebpageScript() {
        const markerId = "fpdl-webpage-script";
        if (document.getElementById(markerId)) return;

        const script = document.createElement("script");
        script.id = markerId;
        script.type = "module";

        try {
            script.src = chrome.runtime.getURL("extensions/webpage-script.js");
            script.onload = () => {
                script.remove();
            };
            script.onerror = (e) => {
                console.warn("[fpdl] Failed to load webpage-script.js via script.src", e);
            };
            document.documentElement.appendChild(script);
        } catch (err) {
            console.warn("[fpdl] Failed to inject webpage-script.js", err);
        }
    }

    // Install the fetch hook as early as possible (document_start).
    injectFetchHijack();

    // Install the floating post table renderer.
    injectPostTable();

    // Inject the page-world helper script (pasteable console version).
    injectWebpageScript();

    // Bridge download requests from page-world UI to the extension background.
    window.addEventListener("message", (event) => {
        try {
            if (event.source !== window) return;

            const data = event.data;
            if (!isDownloadMessageData(data)) return;

            const { url, filename } = data;

            /** @type {import("./types").FpdlDownloadMessage} */
            const message = { type: "FPDL_DOWNLOAD", url, filename };

            chrome.runtime.sendMessage(message, () => {
                // Ignore response here; UI is best-effort.
            });
        } catch (err) {
            console.warn("[fpdl] download bridge failed", err);
        }
    });
})();
