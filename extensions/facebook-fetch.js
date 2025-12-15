(() => {
    // Prevent double-install if injected multiple times.
    // @ts-ignore
    if (window.__fpdlFacebookFetchInstalled) return;
    // @ts-ignore
    window.__fpdlFacebookFetchInstalled = true;

    // Use the current page origin so redirects (facebook.com -> www.facebook.com)
    // and alternate hosts (web.facebook.com, m.facebook.com) still match.
    const GRAPHQL_URL = `${location.origin}/api/graphql/`;

    // Facebook uses different GraphQL operation ("friendly") names depending on context.
    // - Home feed: CometNewsFeedPaginationQuery
    // - Group feed: GroupsCometFeedRegularStoriesPaginationQuery
    const TARGET_API_NAMES = new Set([
        "CometNewsFeedPaginationQuery",
        "GroupsCometFeedRegularStoriesPaginationQuery",
    ]);

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
     * Best-effort GraphQL request context captured from real page traffic.
     * Used to replay the same operation later (for attachment retrieval).
     */
    // @ts-ignore
    const fpdlGraphql = (window.__fpdl_graphql =
        // @ts-ignore
        window.__fpdl_graphql && typeof window.__fpdl_graphql === "object"
            ? // @ts-ignore
            window.__fpdl_graphql
            : // @ts-ignore
            (window.__fpdl_graphql = { operations: Object.create(null), lastParams: null, lastLsd: null }));

    /**
     * @param {any} body
     * @returns {URLSearchParams | null}
     */
    function bodyToParams(body) {
        try {
            if (!body) return null;
            if (typeof body === "string") return new URLSearchParams(body);
            if (body instanceof URLSearchParams) return body;
            if (typeof FormData !== "undefined" && body instanceof FormData) {
                /** @type {string[]} */
                const parts = [];
                for (const [k, v] of body.entries()) {
                    parts.push(`${encodeURIComponent(String(k))}=${encodeURIComponent(String(v))}`);
                }
                return new URLSearchParams(parts.join("&"));
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Capture doc_id/variables template + base request params from any GraphQL request.
     * @param {string | null} apiName
     * @param {any} body
     * @param {any} headers
     */
    function captureGraphqlContext(apiName, body, headers) {
        try {
            const params = bodyToParams(body);
            if (!params) return;

            const lsd = params.get("lsd") || getHeaderValue(headers, "x-fb-lsd");
            if (lsd) fpdlGraphql.lastLsd = String(lsd);

            /** @type {Record<string, string>} */
            const lastParams = Object.create(null);
            for (const [k, v] of params.entries()) {
                if (k === "variables" || k === "doc_id" || k === "fb_api_req_friendly_name") continue;
                lastParams[k] = String(v);
            }
            fpdlGraphql.lastParams = lastParams;

            if (!apiName) return;
            const docId = params.get("doc_id");
            if (!docId) return;

            const variablesStr = params.get("variables");
            let variables = null;
            if (variablesStr) {
                try {
                    variables = JSON.parse(variablesStr);
                } catch {
                    variables = variablesStr;
                }
            }

            fpdlGraphql.operations[String(apiName)] = {
                doc_id: String(docId),
                variablesTemplate: variables && typeof variables === "object" ? variables : null,
            };
        } catch {
            // ignore
        }
    }

    /**
     * Best-effort NDJSON/JSON parser.
     * @param {string} text
     */
    function parseGraphqlPayload(text) {
        const objs = parseNdjson(text);
        if (objs.length > 0) return objs;
        try {
            return [JSON.parse(text)];
        } catch {
            return [];
        }
    }

    /**
     * @param {any} obj
     * @returns {{ currMedia: any | null, nextId: string | null, prevId: string | null }}
     */
    function extractMediaNav(obj) {
        /** @type {any | null} */
        let currMedia = null;
        /** @type {string | null} */
        let nextId = null;
        /** @type {string | null} */
        let prevId = null;

        const root = obj?.data;
        if (root?.currMedia) currMedia = root.currMedia;

        /** @param {any} node */
        function walk(node) {
            if (!node || typeof node !== "object") return;
            if (!nextId && node?.nextMediaAfterNodeId?.id) nextId = String(node.nextMediaAfterNodeId.id);
            if (!prevId && node?.prevMediaBeforeNodeId?.id) prevId = String(node.prevMediaBeforeNodeId.id);
            for (const key of Object.keys(node)) {
                const val = node[key];
                if (val && typeof val === "object") walk(val);
            }
        }
        walk(obj);

        return { currMedia, nextId, prevId };
    }

    /**
     * Replay a GraphQL call using captured base params.
     * @param {{ apiName: string, docId: string, variables: any }} input
     */
    async function fpdlGraphqlFetch(input) {
        if (!fpdlGraphql.lastParams) {
            throw new Error("Missing GraphQL context (no captured request params yet)");
        }

        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(fpdlGraphql.lastParams)) params.set(k, v);
        params.set("fb_api_req_friendly_name", input.apiName);
        params.set("doc_id", input.docId);
        params.set("server_timestamps", "true");
        params.set("variables", JSON.stringify(input.variables || {}));

        /** @type {Record<string, string>} */
        const headers = { "content-type": "application/x-www-form-urlencoded" };
        if (fpdlGraphql.lastLsd) headers["x-fb-lsd"] = fpdlGraphql.lastLsd;
        headers["x-fb-friendly-name"] = input.apiName;

        const res = await fetch(GRAPHQL_URL, {
            method: "POST",
            credentials: "include",
            headers,
            body: params.toString(),
            // @ts-ignore
            __fpdl_internal: true,
        });

        return await res.text();
    }

    // @ts-ignore
    window.__fpdl_graphqlFetch = fpdlGraphqlFetch;

    /**
     * Retrieve the missing attachments for a captured post by walking the media viewer graph.
     * Requires that at least one CometPhotoRootContentQuery ran on this page to seed doc_id + variables.
     * @param {any} postOrPostId
     */
    async function fpdlRetrieveAttachments(postOrPostId) {
        const post =
            postOrPostId && typeof postOrPostId === "object"
                ? postOrPostId
                : fpdlPosts.find((p) => String(p?.post_id) === String(postOrPostId) || String(p?.id) === String(postOrPostId));
        if (!post) throw new Error("Post not found");

        const total = typeof post.attachmentsTotalCount === "number" ? post.attachmentsTotalCount : 0;
        const existingAttachments = Array.isArray(post.attachments) ? post.attachments : [];
        if (total > 0 && existingAttachments.length >= total) return post;

        const mediasetToken = post?.post_id ? `pcb.${String(post.post_id)}` : null;
        if (!mediasetToken) throw new Error("Missing post.post_id (needed for mediasetToken)");

        /** @type {string | null} */
        let seedId = null;
        for (const a of existingAttachments) {
            const id = a?.media?.id;
            seedId = typeof id === "string" && id ? id : null;
            if (seedId) break;
        }
        if (!seedId) throw new Error("Missing seed media id in post.attachments");

        const op = fpdlGraphql.operations["CometPhotoRootContentQuery"];
        const docId = op?.doc_id || "25032105663079180";

        /** @type {any} */
        const template = op?.variablesTemplate && typeof op.variablesTemplate === "object" ? op.variablesTemplate : {};

        /**
         * @param {string} nodeId
         */
        async function fetchNav(nodeId) {
            const variables = {
                ...template,
                isMediaset: true,
                nodeID: String(nodeId),
                mediasetToken: String(mediasetToken),
            };
            if (typeof variables.scale !== "number") variables.scale = 1;

            const text = await fpdlGraphqlFetch({
                apiName: "CometPhotoRootContentQuery",
                docId,
                variables,
            });

            const objs = parseGraphqlPayload(text);
            /** @type {any | null} */
            let currMedia = null;
            /** @type {string | null} */
            let nextId = null;
            /** @type {string | null} */
            let prevId = null;
            for (const o of objs) {
                const nav = extractMediaNav(o);
                if (!currMedia && nav.currMedia) currMedia = nav.currMedia;
                if (!nextId && nav.nextId) nextId = nav.nextId;
                if (!prevId && nav.prevId) prevId = nav.prevId;
            }
            return { currMedia, nextId, prevId };
        }

        /** @type {Set<string>} */
        const seen = new Set();
        const limit = Math.max(10, total || 0, existingAttachments.length || 0);

        /**
         * @param {"next" | "prev"} direction
         */
        async function walk(direction) {
            /** @type {any[]} */
            const out = [];
            /** @type {string | null} */
            let currentId = seedId;
            while (currentId && !seen.has(String(currentId)) && out.length < limit) {
                const { currMedia, nextId, prevId } = await fetchNav(String(currentId));
                const mediaId = currMedia?.id ? String(currMedia.id) : String(currentId);
                if (!mediaId) break;
                seen.add(mediaId);
                if (currMedia) out.push(currMedia);
                currentId = direction === "next" ? nextId : prevId;
            }
            return out;
        }

        const forward = await walk("next");
        seen.clear();
        const backward = await walk("prev");

        // Build an ordered id list: reverse(backward) (includes seed) + forward (includes seed).
        /** @type {string[]} */
        const orderedIds = [];
        for (let i = backward.length - 1; i >= 0; i--) {
            const id = backward[i]?.id;
            if (!id) continue;
            const s = String(id);
            if (!orderedIds.includes(s)) orderedIds.push(s);
        }
        for (const m of forward) {
            const id = m?.id;
            if (!id) continue;
            const s = String(id);
            if (!orderedIds.includes(s)) orderedIds.push(s);
        }

        /** @type {any[]} */
        const merged = [];
        for (const id of orderedIds) {
            const existing = existingAttachments.find(
                /** @param {any} a */
                (a) => a?.media?.id === id,
            );
            if (existing) {
                merged.push(existing);
                continue;
            }

            const media =
                forward.find(
                    /** @param {any} m */
                    (m) => String(m?.id) === id,
                ) ||
                backward.find(
                    /** @param {any} m */
                    (m) => String(m?.id) === id,
                );
            if (media) merged.push({ media });
        }

        // Append any remaining existing attachments that didn't map to ids.
        for (const a of existingAttachments) {
            const id = a?.media?.id;
            if (!id || !orderedIds.includes(String(id))) merged.push(a);
        }

        post.attachments = merged;
        post.__fpdl_lastUpdated = Date.now();
        return post;
    }

    // @ts-ignore
    window.__fpdl_retrieveAttachments = fpdlRetrieveAttachments;

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
        const rawNodes = Array.isArray(allSubattachments?.nodes) ? allSubattachments.nodes : [];
        const nodes = rawNodes
            .map(
                /** @param {any} n */
                (n) => (n?.media ? { media: n.media } : null),
            )
            .filter(Boolean);
        const totalCount =
            typeof allSubattachments?.count === "number"
                ? allSubattachments.count
                : rawNodes.length > 0
                    ? rawNodes.length
                    : 1;

        if (nodes.length > 0 || typeof allSubattachments?.count === "number") {
            return { totalCount, nodes };
        }

        // Single attachment (e.g. photo renderer) shape: styles.attachment.media...
        const styleAttachment = att?.styles?.attachment;
        if (styleAttachment) {
            const media = styleAttachment?.media;
            return { totalCount: 1, nodes: media ? [{ media }] : [] };
        }

        // Fallback: keep the raw attachment wrapper.
        const media = att?.media;
        return { totalCount: 1, nodes: media ? [{ media }] : [] };
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

        // Group feed query shape.
        // Observed in group browsing HARs:
        //   data.node.group_feed.edges[].node.comet_sections.content.story
        const groupFeedEdges = obj?.data?.node?.group_feed?.edges;
        if (Array.isArray(groupFeedEdges)) {
            for (const edge of groupFeedEdges) {
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

                // @ts-ignore
                if (init && init.__fpdl_internal) {
                    // @ts-ignore
                    return originalFetch.apply(this, arguments);
                }

                const headers = (init && init.headers) || (inputAny && inputAny.headers) || null;
                const apiNameFromHeader = getHeaderValue(headers, "x-fb-friendly-name");
                const apiNameFromBody = extractApiNameFromBody(init && init.body);
                const apiName = apiNameFromHeader || apiNameFromBody;

                captureGraphqlContext(apiName, init && init.body, headers);

                if (!apiName || !TARGET_API_NAMES.has(apiName)) {
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

                            captureGraphqlContext(apiName, self.__fpdl_body, headers);
                            if (!apiName || !TARGET_API_NAMES.has(apiName)) return;

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
