import { storyListener, downloadStory, getAttachmentCount, getCreateTime } from './story.js';
import { React, ReactDOM } from './react.js';
import { useDownloadButtonInjection } from './download-button.js';

/**
 * @typedef {import('./types').Story} Story
 */

const { useState, useEffect, useCallback } = React;

/**
 * @param {{ story: Story, onDownloadFile: (url: string, filename: string) => void }} props
 */
function StoryRow({ story, onDownloadFile }) {
    const [downloading, setDownloading] = useState(false);

    const handleDownload = useCallback(async () => {
        try {
            setDownloading(true);

            await downloadStory(story, onDownloadFile);
        } catch (err) {
            console.warn("[fpdl] download failed", err);
        } finally {
            setDownloading(false);
        }
    }, [story]);

    const isDisabled = downloading;
    const buttonText = downloading ? "Downloading…" : "Download";

    const cellStyle = { padding: "4px 6px", borderBottom: "1px solid rgba(255,255,255,0.08)", verticalAlign: "top" };

    return React.createElement("tr", null,
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getCreateTime(story)?.toLocaleString() ?? ""),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, story.post_id),
        React.createElement("td", { style: { ...cellStyle, wordBreak: "break-word" } }, (story.message?.text ?? "").slice(0, 100)),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, story.attached_story ? "true" : "false"),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getAttachmentCount(story)),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } },
            React.createElement("button", {
                type: "button",
                disabled: isDisabled,
                onClick: handleDownload,
                style: {
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
 * @param {{ stories: Story[], onDownloadFile: (url: string, filename: string) => void, onClose: () => void }} props
 */
function StoryTable({ stories, onDownloadFile, onClose }) {
    const containerStyle = {
        position: "fixed",
        left: "12px",
        bottom: "12px",
        zIndex: 2147483647,
        maxWidth: "90vw",
        maxHeight: "80vh",
        overflow: "auto",
        background: "rgba(0, 0, 0, 0.5)",
        color: "#fff",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        borderRadius: "6px",
        padding: "8px",
    };

    const headerStyle = {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "6px",
    };

    const titleStyle = {
        fontSize: "12px",
        fontWeight: 700,
        userSelect: "none",
    };

    const closeButtonStyle = {
        background: "transparent",
        border: "none",
        color: "#fff",
        fontSize: "16px",
        cursor: "pointer",
        padding: "0 4px",
        lineHeight: 1,
        opacity: 0.7,
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
        React.createElement("div", { style: headerStyle },
            React.createElement("div", { style: titleStyle }, "Facebook Post Downloader"),
            React.createElement("button", {
                type: "button",
                style: closeButtonStyle,
                onClick: onClose,
                title: "Close",
            }, "×")
        ),
        React.createElement("table", { style: tableStyle },
            React.createElement("thead", null,
                React.createElement("tr", null,
                    React.createElement("th", { style: thStyle }, "create_time"),
                    React.createElement("th", { style: thStyle }, "post_id"),
                    React.createElement("th", { style: thStyle }, "text"),
                    React.createElement("th", { style: thStyle }, "attached_story"),
                    React.createElement("th", { style: thStyle }, "attachments"),
                    React.createElement("th", { style: thStyle }, "download")
                )
            ),
            React.createElement("tbody", null,
                stories.map((story) =>
                    React.createElement(StoryRow, { key: story.id, story, onDownloadFile })
                )
            )
        )
    );
}

/**
 * @param {{ initialStories: Story[], onStory: (cb: (story: Story) => void) => void }} props
 */
function App({ initialStories, onStory }) {
    const [stories, setStories] = useState(initialStories);
    const [visible, setVisible] = useState(false);

    const onDownloadFile = useCallback(
        /** @param {string} url @param {string} filename */
        (url, filename) => {
            window.postMessage({ __fpdl: true, type: "FPDL_DOWNLOAD", url, filename }, window.location.origin);
        }, []);

    const onClose = useCallback(() => {
        setVisible(false);
    }, []);

    // Listen for toggle messages
    useEffect(() => {
        /** @param {MessageEvent} event */
        const listener = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || typeof data !== 'object' || !data.__fpdl) return;
            if (data.type === 'FPDL_TOGGLE') {
                setVisible(v => !v);
            }
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, []);

    // Subscribe to new stories
    useEffect(() => {
        onStory((story) => {
            setStories(prev => [...prev, story]);
        });
    }, [onStory]);

    // Inject download buttons when stories change
    useDownloadButtonInjection(stories, onDownloadFile);

    if (!visible) return null;

    return React.createElement(StoryTable, { stories, onDownloadFile, onClose });
}

function run() {
    /** @type {Story[]} */
    const collectedStories = [];
    /** @type {((story: Story) => void) | null} */
    let storyCallback = null;

    // Start listening immediately, before React mounts
    storyListener((story) => {
        if (storyCallback) {
            storyCallback(story);
        } else {
            collectedStories.push(story);
        }
    });

    const container = document.createElement('div');
    container.id = 'fpdl-post-table-root';
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    root.render(React.createElement(App, {
        initialStories: collectedStories,
        onStory: (cb) => { storyCallback = cb; }
    }));
}

run();
