// @ts-check

(() => {
    // Prevent double-install if injected multiple times.
    // @ts-ignore
    if (window.__fpdlFacebookFetchInstalled) return;
    // @ts-ignore
    window.__fpdlFacebookFetchInstalled = true;

    const currentScript = /** @type {HTMLScriptElement | null} */ (document.currentScript);
    const ds = currentScript ? currentScript.dataset : /** @type {any} */ ({});

    const GRAPHQL_URL = ds.graphqlUrl || `${location.origin}/api/graphql/`;
    const TARGET_API_NAME = ds.targetApiName || "CometNewsFeedPaginationQuery";

    /**
     * Deduplicate stories across response chunks using story.id.
     * @type {Set<string>}
     */
    const seenStoryIds = new Set();

    /**
     * Captured posts are stored on the page world for now.
     * @type {any[]}
     */
    // @ts-ignore
    const fpdlPosts = (window.__fpdl_posts = Array.isArray(window.__fpdl_posts) ? window.__fpdl_posts : []);

    /**
     * Extract attachment info from story.attachments (typically 0 or 1 element).
     * Album-style attachments expose a total count at:
     *   attachment.styles.attachment.all_subattachments.count
     * and preloaded attachments at:
     *   attachment.styles.attachment.all_subattachments.nodes
     * Single-photo attachments have a different shape.
     *
     * @param {any} story
     * @returns {{ totalCount: number, nodes: any[] }}
     */
    function extractAttachmentInfo(story) {
        const attachments = story?.attachments;
        if (!Array.isArray(attachments) || attachments.length === 0) {
            return { totalCount: 0, nodes: [] };
        }

        const att = attachments[0];

        // Album shape: styles.attachment.all_subattachments.{count,nodes}
        const allSubattachments = att?.styles?.attachment?.all_subattachments;
        const nodes = Array.isArray(allSubattachments?.nodes) ? allSubattachments.nodes : [];
        const totalCount =
            typeof allSubattachments?.count === "number"
                ? allSubattachments.count
                : nodes.length > 0
                    ? nodes.length
                    : 1;

        if (nodes.length > 0 || typeof allSubattachments?.count === "number") {
            return { totalCount, nodes };
        }

        // Single attachment (e.g. photo renderer) shape: styles.attachment.media...
        const styleAttachment = att?.styles?.attachment;
        if (styleAttachment) {
            return { totalCount: 1, nodes: [styleAttachment] };
        }

        // Fallback: keep the raw attachment wrapper.
        return { totalCount: 1, nodes: [att] };
    }

    /**
     * @param {any} story
     */
    function storeCapturedStory(story) {
        try {
            const text = story?.message?.text;
            if (typeof text !== "string" || !text.trim()) return;

            const attachmentInfo = extractAttachmentInfo(story);

            fpdlPosts.push({
                id: story?.id ?? null,
                post_id: story?.post_id ?? null,
                text,
                attachmentsTotalCount: attachmentInfo.totalCount,
                attachments: attachmentInfo.nodes,
                story,
            });

            // Prevent unbounded growth.
            const MAX = 500;
            if (fpdlPosts.length > MAX) fpdlPosts.splice(0, fpdlPosts.length - MAX);
        } catch {
            // ignore
        }
    }

    /**
     * @param {string} url
     */
    function isGraphqlUrl(url) {
        try {
            const u = new URL(url, location.href);
            // Be tolerant to host redirects (facebook.com -> www.facebook.com)
            // and trailing slash differences.
            if (!u.hostname.endsWith("facebook.com")) return false;
            return u.pathname === "/api/graphql" || u.pathname === "/api/graphql/";
        } catch {
            // Fallback to the older string check for unexpected URL shapes.
            return url === GRAPHQL_URL || url.startsWith(GRAPHQL_URL + "?");
        }
    }

    /**
     * @param {any} headers
     * @param {string} name
     */
    function getHeaderValue(headers, name) {
        try {
            if (!headers) return null;
            if (typeof headers.get === "function") return headers.get(name);
            if (Array.isArray(headers)) {
                const found = headers.find(
                    (h) => h && h[0] && String(h[0]).toLowerCase() === String(name).toLowerCase(),
                );
                return found ? found[1] : null;
            }
            if (typeof headers === "object") {
                const lowered = String(name).toLowerCase();
                for (const key of Object.keys(headers)) {
                    if (String(key).toLowerCase() === lowered) return headers[key];
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * @param {any} body
     */
    function extractApiNameFromBody(body) {
        try {
            if (!body) return null;
            if (typeof body === "string") {
                const params = new URLSearchParams(body);
                return params.get("fb_api_req_friendly_name") || null;
            }
            if (body instanceof URLSearchParams) {
                return body.get("fb_api_req_friendly_name") || null;
            }
            // Some GraphQL requests use FormData.
            if (typeof FormData !== "undefined" && body instanceof FormData) {
                const v = body.get("fb_api_req_friendly_name");
                return v ? String(v) : null;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Extract story objects from both stream patches and full query payloads.
     * @param {any} obj
     */
    function extractStories(obj) {
        /** @type {any[]} */
        const stories = [];

        // Stream patch shape.
        const patchStory = obj?.data?.node?.comet_sections?.content?.story;
        if (patchStory) stories.push(patchStory);

        // Full query shape.
        const edges = obj?.data?.viewer?.news_feed?.edges;
        if (Array.isArray(edges)) {
            for (const edge of edges) {
                const edgeStory = edge?.node?.comet_sections?.content?.story;
                if (edgeStory) stories.push(edgeStory);
            }
        }

        return stories;
    }

    /**
     * @param {string} text
     */
    function parseNdjson(text) {
        // Strip common anti-JSON prefixes.
        if (text.startsWith("for (;;);")) text = text.slice("for (;;);".length);
        if (text.startsWith(")]}'")) {
            const firstNewline = text.indexOf("\n");
            text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
        }

        return text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
                try {
                    return JSON.parse(l);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    }

    /**
     * @param {string} responseText
     */
    function logMatchingNewsFeedEntries(responseText) {
        const objs = parseNdjson(responseText);
        for (const obj of objs) {
            // Always try to extract story texts, even for unlabeled lines.
            // Some responses contain full objects like { data: { viewer: { news_feed: { edges: [...] }}}}
            // and do not include `label` at all.
            const stories = extractStories(obj);
            for (const storyObj of stories) {
                const storyText = storyObj?.message?.text;
                if (typeof storyText === "string" && storyText.trim()) {
                    const storyId = storyObj?.id;
                    if (typeof storyId !== "string" || !storyId) continue;

                    if (!seenStoryIds.has(storyId)) {
                        seenStoryIds.add(storyId);
                        storeCapturedStory(storyObj);
                    }
                }
            }
        }
    }

    // --------------------
    // fetch() hook
    // --------------------
    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
        // @ts-ignore
        window.fetch = function patchedFetch(input, init) {
            try {
                /** @type {any} */
                const inputAny = input;

                const url =
                    typeof inputAny === "string" ? inputAny : inputAny && inputAny.url ? inputAny.url : "";
                const method = (init && init.method) || (inputAny && inputAny.method) || "GET";
                const normalizedMethod = String(method).toUpperCase();

                if (!isGraphqlUrl(url) || normalizedMethod !== "POST") {
                    // @ts-ignore
                    return originalFetch.apply(this, arguments);
                }

                const headers = (init && init.headers) || (inputAny && inputAny.headers) || null;
                const apiNameFromHeader = getHeaderValue(headers, "x-fb-friendly-name");
                const apiNameFromBody = extractApiNameFromBody(init && init.body);
                const apiName = apiNameFromHeader || apiNameFromBody;

                if (apiName !== TARGET_API_NAME) {
                    // @ts-ignore
                    return originalFetch.apply(this, arguments);
                }

                // @ts-ignore
                const fetchPromise = originalFetch.apply(this, arguments);
                fetchPromise
                    .then((response) => {
                        (async () => {
                            try {
                                if (!response || typeof response.clone !== "function") return;
                                const text = await response.clone().text();
                                logMatchingNewsFeedEntries(text);
                            } catch (err) {
                                console.warn("[fpdl] Failed to parse fetch GraphQL NDJSON response", err);
                            }
                        })();
                    })
                    .catch(() => {
                        // ignore
                    });

                return fetchPromise;
            } catch {
                // @ts-ignore
                return originalFetch.apply(this, arguments);
            }
        };
    }

    // --------------------
    // XMLHttpRequest hook
    // --------------------
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    /**
     * @param {any} method
     * @param {any} url
     */
    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
        try {
            /** @type {any} */
            const self = this;

            self.__fpdl_method = String(method || "GET").toUpperCase();
            self.__fpdl_url = typeof url === "string" ? url : String(url);
            self.__fpdl_isTarget = isGraphqlUrl(self.__fpdl_url || "");

            if (self.__fpdl_isTarget) {
                self.__fpdl_headers = Object.create(null);

                if (!self.__fpdl_listenersAttached) {
                    self.__fpdl_listenersAttached = true;
                    self.addEventListener("load", () => {
                        try {
                            if (!self.__fpdl_isTarget) return;
                            if (self.__fpdl_method !== "POST") return;

                            const headers = self.__fpdl_headers || {};
                            const apiNameFromHeader = headers["x-fb-friendly-name"];
                            const apiNameFromBody = extractApiNameFromBody(self.__fpdl_body);
                            const apiName = apiNameFromHeader || apiNameFromBody;
                            if (apiName !== TARGET_API_NAME) return;

                            if (typeof self.responseText === "string") {
                                logMatchingNewsFeedEntries(self.responseText);
                            }
                        } catch (err) {
                            console.warn("[fpdl] Failed to parse XHR GraphQL NDJSON response", err);
                        }
                    });
                }
            }
        } catch {
            // ignore
        }

        // @ts-ignore
        return originalXhrOpen.apply(this, arguments);
    };

    /**
     * @param {any} name
     * @param {any} value
     */
    XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name, value) {
        try {
            /** @type {any} */
            const self = this;
            if (self.__fpdl_isTarget && self.__fpdl_headers && name) {
                self.__fpdl_headers[String(name).toLowerCase()] = String(value);
            }
        } catch {
            // ignore
        }
        // @ts-ignore
        return originalXhrSetRequestHeader.apply(this, arguments);
    };

    /**
     * @param {any} body
     */
    XMLHttpRequest.prototype.send = function patchedSend(body) {
        try {
            /** @type {any} */
            const self = this;
            if (self.__fpdl_isTarget) {
                self.__fpdl_body = body;
            }
        } catch {
            // ignore
        }
        // @ts-ignore
        return originalXhrSend.apply(this, arguments);
    };
})();
