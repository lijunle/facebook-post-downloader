(() => {
    // Prevent double-install if injected multiple times.
    // @ts-ignore
    if (window.__fpdlPostTableInstalled) return;
    // @ts-ignore
    window.__fpdlPostTableInstalled = true;

    const ROOT_ID = "fpdl-post-table-root";

    /**
     * @returns {any[]}
     */
    function getPosts() {
        // @ts-ignore
        const posts = window.__fpdl_posts;
        return Array.isArray(posts) ? posts : [];
    }

    function ensureRoot() {
        const existing = document.getElementById(ROOT_ID);
        if (existing) return existing;

        const root = document.createElement("div");
        root.id = ROOT_ID;

        root.style.position = "fixed";
        root.style.left = "12px";
        root.style.bottom = "12px";
        root.style.zIndex = "2147483647";

        root.style.maxWidth = "520px";
        root.style.maxHeight = "40vh";
        root.style.overflow = "auto";

        // Half-transparent container.
        root.style.background = "rgba(0, 0, 0, 0.5)";
        root.style.color = "#fff";
        root.style.border = "1px solid rgba(255, 255, 255, 0.25)";
        root.style.borderRadius = "6px";
        root.style.padding = "8px";

        const title = document.createElement("div");
        title.textContent = "FPDL Captured Posts";
        title.style.fontSize = "12px";
        title.style.fontWeight = "700";
        title.style.marginBottom = "6px";
        title.style.userSelect = "none";

        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        table.style.fontSize = "12px";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");

        const thIndex = document.createElement("th");
        thIndex.textContent = "#";
        thIndex.style.textAlign = "right";
        thIndex.style.padding = "4px 6px";
        thIndex.style.borderBottom = "1px solid rgba(255,255,255,0.2)";
        thIndex.style.whiteSpace = "nowrap";

        const thPostId = document.createElement("th");
        thPostId.textContent = "post_id";
        thPostId.style.textAlign = "left";
        thPostId.style.padding = "4px 6px";
        thPostId.style.borderBottom = "1px solid rgba(255,255,255,0.2)";
        thPostId.style.whiteSpace = "nowrap";

        const thText = document.createElement("th");
        thText.textContent = "text";
        thText.style.textAlign = "left";
        thText.style.padding = "4px 6px";
        thText.style.borderBottom = "1px solid rgba(255,255,255,0.2)";

        const thAttachments = document.createElement("th");
        thAttachments.textContent = "attachments";
        thAttachments.style.textAlign = "right";
        thAttachments.style.padding = "4px 6px";
        thAttachments.style.borderBottom = "1px solid rgba(255,255,255,0.2)";
        thAttachments.style.whiteSpace = "nowrap";

        headRow.appendChild(thIndex);
        headRow.appendChild(thPostId);
        headRow.appendChild(thText);
        headRow.appendChild(thAttachments);
        thead.appendChild(headRow);

        const tbody = document.createElement("tbody");
        tbody.id = ROOT_ID + "-tbody";

        table.appendChild(thead);
        table.appendChild(tbody);

        root.appendChild(title);
        root.appendChild(table);

        const parent = document.body || document.documentElement;
        parent.appendChild(root);
        return root;
    }

    /**
     * @param {any[]} posts
     */
    function computeRenderSignature(posts) {
        try {
            const recent = posts.slice(-50);
            return recent
                .map((p) => {
                    const postId = p?.post_id ?? "";
                    const total = typeof p?.attachmentsTotalCount === "number" ? p.attachmentsTotalCount : 0;
                    const loaded = Array.isArray(p?.attachments) ? p.attachments.length : 0;
                    const updated = typeof p?.__fpdl_lastUpdated === "number" ? p.__fpdl_lastUpdated : 0;
                    const retrieving = p?.__fpdl_retrieving ? 1 : 0;
                    const downloading = p?.__fpdl_downloading ? 1 : 0;
                    return `${postId}:${loaded}/${total}:${updated}:${retrieving}:${downloading}`;
                })
                .join("|");
        } catch {
            return String(posts.length);
        }
    }

    function render() {
        const root = ensureRoot();
        const tbody = /** @type {HTMLTableSectionElement | null} */ (
            root.querySelector("#" + CSS.escape(ROOT_ID + "-tbody"))
        );
        if (!tbody) return;

        const posts = getPosts();

        // Cheap diff: rerender when recent rows changed.
        // @ts-ignore
        const lastSig = root.__fpdl_lastSig || "";
        const sig = computeRenderSignature(posts);
        if (lastSig === sig) return;
        // @ts-ignore
        root.__fpdl_lastSig = sig;

        tbody.textContent = "";

        const recent = posts.slice(-50);
        for (let i = 0; i < recent.length; i++) {
            const post = recent[i];
            const tr = document.createElement("tr");

            const tdIndex = document.createElement("td");
            tdIndex.style.padding = "4px 6px";
            tdIndex.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
            tdIndex.style.whiteSpace = "nowrap";
            tdIndex.style.textAlign = "right";
            tdIndex.style.verticalAlign = "top";
            tdIndex.textContent = String(i);

            const tdPostId = document.createElement("td");
            tdPostId.style.padding = "4px 6px";
            tdPostId.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
            tdPostId.style.whiteSpace = "nowrap";
            tdPostId.style.verticalAlign = "top";
            tdPostId.textContent = String(post.post_id);

            const tdText = document.createElement("td");
            tdText.style.padding = "4px 6px";
            tdText.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
            tdText.style.wordBreak = "break-word";
            tdText.style.verticalAlign = "top";
            tdText.textContent = post.text.slice(0, 100);

            const tdAttachments = document.createElement("td");
            tdAttachments.style.padding = "4px 6px";
            tdAttachments.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
            tdAttachments.style.whiteSpace = "nowrap";
            tdAttachments.style.textAlign = "right";
            tdAttachments.style.verticalAlign = "top";

            const total = typeof post?.attachmentsTotalCount === "number" ? post.attachmentsTotalCount : 0;
            const loaded = Array.isArray(post?.attachments) ? post.attachments.length : 0;
            tdAttachments.textContent = `${loaded}/${total}`;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = post.__fpdl_downloading ? "Downloading…" : "Download";
            btn.disabled = Boolean(post.__fpdl_retrieving || post.__fpdl_downloading);
            btn.style.marginLeft = "6px";
            btn.style.fontSize = "11px";
            btn.style.padding = "2px 6px";
            btn.style.borderRadius = "4px";
            btn.style.border = "1px solid rgba(255,255,255,0.35)";
            btn.style.background = "rgba(255,255,255,0.12)";
            btn.style.color = "#fff";
            btn.style.cursor = btn.disabled ? "not-allowed" : "pointer";

            /**
             * @param {string} url
             */
            function guessExt(url) {
                try {
                    if (/\.png(\?|$)/i.test(url)) return "png";
                    const u = new URL(url);
                    const fmt = u.searchParams.get("format");
                    if (fmt && /^png$/i.test(fmt)) return "png";
                    return "jpg";
                } catch {
                    return /\.png(\?|$)/i.test(url) ? "png" : "jpg";
                }
            }

            btn.addEventListener("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                try {
                    post.__fpdl_retrieving = true;
                    post.__fpdl_downloading = false;
                    post.__fpdl_lastUpdated = Date.now();
                    render();

                    // 1) Retrieve attachments (best-effort)
                    // @ts-ignore
                    const fn = window.__fpdl_retrieveAttachments;
                    if (typeof fn !== "function") {
                        throw new Error("Missing window.__fpdl_retrieveAttachments");
                    }
                    await fn(post);

                    // 2) Download photos
                    post.__fpdl_retrieving = false;
                    post.__fpdl_downloading = true;
                    post.__fpdl_lastUpdated = Date.now();
                    render();

                    const postId = String(post?.post_id || post?.id || "unknown");
                    const atts = Array.isArray(post?.attachments) ? post.attachments : [];

                    /** @type {string[]} */
                    const downloaded = [];

                    /**
                     * @param {any} media
                     * @returns {string | null}
                     */
                    function pickBestProgressiveUrl(media) {
                        const list =
                            media?.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.progressive_urls;
                        if (!Array.isArray(list) || list.length === 0) return null;

                        const hd = list.find(
                            /** @param {any} x */
                            (x) => x?.metadata?.quality === "HD" && typeof x?.progressive_url === "string" && x.progressive_url,
                        );
                        if (hd && typeof hd.progressive_url === "string") return hd.progressive_url;

                        const first = list.find(
                            /** @param {any} x */
                            (x) => typeof x?.progressive_url === "string" && x.progressive_url,
                        );
                        return first ? String(first.progressive_url) : null;
                    }

                    for (const a of atts) {
                        const media = a?.media ? a.media : a;
                        if (!media) continue;

                        const attachmentId = a?.id || a?.media?.id || media?.id || null;
                        if (typeof attachmentId !== "string" || !attachmentId) continue;
                        if (downloaded.includes(attachmentId)) continue;

                        // Video download: use progressive URLs (prefer HD).
                        if (media.__isMedia === "Video" || media.__typename === "Video") {
                            const videoUrl = pickBestProgressiveUrl(media);
                            if (!videoUrl) continue;
                            downloaded.push(attachmentId);
                            const filename = `${postId}/${attachmentId}.mp4`;
                            window.postMessage(
                                {
                                    __fpdl: true,
                                    type: "FPDL_DOWNLOAD",
                                    url: videoUrl,
                                    filename,
                                },
                                "*",
                            );
                            continue;
                        }

                        const url =
                            media?.viewer_image?.uri ||
                            media?.image?.uri ||
                            media?.photo_image?.uri ||
                            media?.preferred_image?.uri ||
                            null;

                        if (typeof url !== "string" || !url) continue;
                        downloaded.push(attachmentId);
                        const ext = guessExt(url);
                        const filename = `${postId}/${attachmentId}.${ext}`;

                        window.postMessage(
                            {
                                __fpdl: true,
                                type: "FPDL_DOWNLOAD",
                                url,
                                filename,
                            },
                            "*",
                        );
                    }
                } catch (err) {
                    console.warn("[fpdl] download failed", err);
                } finally {
                    post.__fpdl_retrieving = false;
                    post.__fpdl_downloading = false;
                    post.__fpdl_lastUpdated = Date.now();
                    render();
                }
            });

            tdAttachments.appendChild(btn);

            tr.appendChild(tdIndex);
            tr.appendChild(tdPostId);
            tr.appendChild(tdText);
            tr.appendChild(tdAttachments);
            tbody.appendChild(tr);
        }
    }

    function start() {
        // Ensure root exists eventually even at document_start.
        if (!document.body) {
            document.addEventListener(
                "DOMContentLoaded",
                () => {
                    ensureRoot();
                    render();
                },
                { once: true },
            );
        } else {
            ensureRoot();
            render();
        }

        // Polling update (simple + robust).
        setInterval(render, 500);
    }

    start();
})();
