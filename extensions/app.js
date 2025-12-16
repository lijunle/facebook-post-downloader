// @ts-ignore
await import('../node_modules/umd-react/dist/react.production.min.js');
// @ts-ignore
await import('../node_modules/umd-react/dist/react-dom.production.min.js');

/** @type {typeof import('react')} */
// @ts-ignore
const React = require('React');
/** @type {typeof import('react-dom/client')} */
// @ts-ignore
const ReactDOM = require('ReactDOM');

import { storyListener, fetchAllAttachments } from './story.js';

const { useState, useEffect, useCallback, useRef } = React;

/**
 * @typedef {Object} Post
 * @property {string} id
 * @property {string} post_id
 * @property {string} text
 * @property {number} attachmentsTotalCount
 * @property {import('./types').StoryMedia[]} attachments
 * @property {import('./types').Story} story
 * @property {boolean} [__fpdl_retrieving]
 * @property {boolean} [__fpdl_downloading]
 */

/**
 * @param {string} url
 * @returns {string}
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

/**
 * @param {any} media
 * @returns {string | null}
 */
function pickBestProgressiveUrl(media) {
    const list = media?.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.progressive_urls;
    if (!Array.isArray(list) || list.length === 0) return null;

    const hd = list.find(
        /** @param {any} x */(x) => x?.metadata?.quality === "HD" && typeof x?.progressive_url === "string" && x.progressive_url,
    );
    if (hd && typeof hd.progressive_url === "string") return hd.progressive_url;

    const first = list.find(
        /** @param {any} x */(x) => typeof x?.progressive_url === "string" && x.progressive_url,
    );
    return first ? String(first.progressive_url) : null;
}

/**
 * @param {string} url
 * @param {string} filename
 */
function postFpdlMessage(url, filename) {
    window.postMessage({ __fpdl: true, type: "FPDL_DOWNLOAD", url, filename }, "*");
}

/**
 * @param {{ post: Post, onUpdate: (post: Post) => void, postFpdlMessage: (url: string, filename: string) => void }} props
 */
function PostRow({ post, onUpdate, postFpdlMessage }) {
    const total = typeof post.attachmentsTotalCount === "number" ? post.attachmentsTotalCount : 0;
    const loaded = Array.isArray(post.attachments) ? post.attachments.length : 0;
    const isDisabled = Boolean(post.__fpdl_retrieving || post.__fpdl_downloading);
    const buttonText = post.__fpdl_downloading ? "Downloading…" : "Download";

    const handleDownload = useCallback(async () => {
        try {
            onUpdate({ ...post, __fpdl_retrieving: true, __fpdl_downloading: false });

            const attachments = await fetchAllAttachments(post.story);

            onUpdate({ ...post, attachments, __fpdl_retrieving: false, __fpdl_downloading: true });

            const postId = String(post.post_id || post.id || "unknown");

            /** @type {string[]} */
            const downloaded = [];

            for (const media of attachments) {
                const attachmentId = media.id;
                if (!attachmentId) continue;
                if (downloaded.includes(attachmentId)) continue;

                if (media.__typename === "Video") {
                    const videoUrl = pickBestProgressiveUrl(media);
                    if (!videoUrl) continue;
                    downloaded.push(attachmentId);
                    const filename = `${postId}/${attachmentId}.mp4`;
                    postFpdlMessage(videoUrl, filename);
                    continue;
                }

                const url = media.image?.uri;
                if (typeof url !== "string" || !url) continue;
                downloaded.push(attachmentId);
                const ext = guessExt(url);
                const filename = `${postId}/${attachmentId}.${ext}`;
                postFpdlMessage(url, filename);
            }
        } catch (err) {
            console.warn("[fpdl] download failed", err);
        } finally {
            onUpdate({ ...post, __fpdl_retrieving: false, __fpdl_downloading: false });
        }
    }, [post, onUpdate]);

    const cellStyle = { padding: "4px 6px", borderBottom: "1px solid rgba(255,255,255,0.08)", verticalAlign: "top" };

    return React.createElement("tr", null,
        React.createElement("td", { style: { ...cellStyle, textAlign: "right", whiteSpace: "nowrap" } }, post.post_id),
        React.createElement("td", { style: { ...cellStyle, wordBreak: "break-word" } }, post.text.slice(0, 100)),
        React.createElement("td", { style: { ...cellStyle, textAlign: "right", whiteSpace: "nowrap" } },
            `${loaded}/${total}`,
            React.createElement("button", {
                type: "button",
                disabled: isDisabled,
                onClick: handleDownload,
                style: {
                    marginLeft: "6px",
                    fontSize: "11px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                },
            }, buttonText)
        )
    );
}

/**
 * Build a Post from a Story
 * @param {import('./types').Story} story
 * @returns {Post}
 */
function storyToPost(story) {
    const attachment = story.attachments[0]?.styles.attachment;
    const attachmentInfo = attachment
        ? ('media' in attachment
            ? { totalCount: 1, nodes: [attachment.media] }
            : { totalCount: attachment.all_subattachments.count, nodes: attachment.all_subattachments.nodes.map(n => n.media) })
        : { totalCount: 0, nodes: /** @type {import('./types').StoryMedia[]} */ ([]) };

    return {
        id: story.id,
        post_id: story.post_id,
        text: story.message.text,
        attachmentsTotalCount: attachmentInfo.totalCount,
        attachments: attachmentInfo.nodes,
        story,
    };
}

/**
 * @param {{ storyListener: typeof storyListener, postFpdlMessage: (url: string, filename: string) => void }} props
 */
function PostTable({ storyListener: listener, postFpdlMessage }) {
    const [posts, setPosts] = useState(/** @type {Post[]} */([]));
    const postsRef = useRef(posts);
    postsRef.current = posts;

    useEffect(() => {
        const unsubscribe = listener((story) => {
            const newPost = storyToPost(story);
            setPosts((prev) => [...prev, newPost]);
        });
        return unsubscribe;
    }, [listener]);

    const handleUpdate = useCallback((/** @type {Post} */ updatedPost) => {
        setPosts((prev) => prev.map((p) => p.id === updatedPost.id ? updatedPost : p));
    }, []);

    const recent = posts.slice(-50);

    const containerStyle = {
        position: "fixed",
        left: "12px",
        bottom: "12px",
        zIndex: 2147483647,
        maxWidth: "520px",
        maxHeight: "40vh",
        overflow: "auto",
        background: "rgba(0, 0, 0, 0.5)",
        color: "#fff",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        borderRadius: "6px",
        padding: "8px",
    };

    const titleStyle = {
        fontSize: "12px",
        fontWeight: 700,
        marginBottom: "6px",
        userSelect: "none",
    };

    const tableStyle = {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "12px",
    };

    const thStyle = {
        textAlign: "left",
        padding: "4px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.2)",
        whiteSpace: "nowrap",
    };

    return React.createElement("div", { style: containerStyle },
        React.createElement("div", { style: titleStyle }, "FPDL Captured Posts"),
        React.createElement("table", { style: tableStyle },
            React.createElement("thead", null,
                React.createElement("tr", null,
                    React.createElement("th", { style: thStyle }, "post_id"),
                    React.createElement("th", { style: { ...thStyle, textAlign: "left" } }, "text"),
                    React.createElement("th", { style: { ...thStyle, textAlign: "right" } }, "attachments")
                )
            ),
            React.createElement("tbody", null,
                recent.map((post, i) =>
                    React.createElement(PostRow, { key: post.id || i, post, onUpdate: handleUpdate, postFpdlMessage })
                )
            )
        )
    );
}

export function renderApp() {
    console.log('[FPDL] Rendering React app');

    const container = document.createElement('div');
    container.id = 'fpdl-post-table-root';
    document.body.appendChild(container);
    ReactDOM.createRoot(container).render(React.createElement(PostTable, { storyListener, postFpdlMessage }));
}
