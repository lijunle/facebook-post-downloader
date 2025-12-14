// @ts-check

(function () {
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

            // @ts-ignore - `chrome` exists in extension content-script context.
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
            // @ts-ignore - `chrome` exists in extension content-script context.
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

    // Install the fetch hook as early as possible (document_start).
    injectFetchHijack();

    // Install the floating post table renderer.
    injectPostTable();

    // Bridge download requests from page-world UI to the extension background.
    window.addEventListener("message", (event) => {
        try {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || typeof data !== "object") return;
            if (data.__fpdl !== true) return;
            if (data.type !== "FPDL_DOWNLOAD") return;

            const url = data.url;
            const filename = data.filename;
            if (typeof url !== "string" || typeof filename !== "string") return;

            // Forward to service worker.
            // @ts-ignore
            chrome.runtime.sendMessage({ type: "FPDL_DOWNLOAD", url, filename }, () => {
                // Ignore response here; UI is best-effort.
            });
        } catch (err) {
            console.warn("[fpdl] download bridge failed", err);
        }
    });
})();
