// @ts-check

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

    function render() {
        const root = ensureRoot();
        const tbody = /** @type {HTMLTableSectionElement | null} */ (
            root.querySelector("#" + CSS.escape(ROOT_ID + "-tbody"))
        );
        if (!tbody) return;

        const posts = getPosts();

        // Cheap diff: if length unchanged, skip.
        // (We can revisit later if you want editing/updating rows.)
        // @ts-ignore
        const lastLen = root.__fpdl_lastLen || 0;
        if (lastLen === posts.length) return;
        // @ts-ignore
        root.__fpdl_lastLen = posts.length;

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
            tdAttachments.textContent = String(post.attachmentsTotalCount);

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
