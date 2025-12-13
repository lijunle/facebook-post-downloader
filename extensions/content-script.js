// @ts-check

(function () {
    // Use the current page origin so redirects (facebook.com -> www.facebook.com)
    // and alternate hosts (web.facebook.com, m.facebook.com) still match.
    const GRAPHQL_URL = `${location.origin}/api/graphql/`;
    const TARGET_API_NAME = "CometNewsFeedPaginationQuery";

    /**
     * Injects a script into the page context (not the isolated extension world)
     * so we can wrap the real `window.fetch` used by the page.
     *
     * @returns {void}
     */
    function injectFetchHijack() {
        const markerId = "fpdl-facebook-fetch";
        if (document.getElementById(markerId)) return;

        const script = document.createElement("script");
        script.id = markerId;
        script.type = "text/javascript";

        // Facebook CSP blocks inline scripts (`textContent`), but (per the console error)
        // it allows scripts sourced from our extension origin. So we inject using `src`.

        script.dataset.graphqlUrl = GRAPHQL_URL;
        script.dataset.targetApiName = TARGET_API_NAME;

        try {
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
})();
