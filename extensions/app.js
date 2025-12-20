import { storyListener, downloadStory, getAttachmentCount, getCreateTime } from './story.js';
import { React, ReactDOM } from './react.js';
import { useDownloadButtonInjection } from './download-button.js';

/**
 * @typedef {import('./types').Story} Story
 */

const { useState, useEffect, useCallback } = React;

/**
 * @param {{ story: Story, selected: boolean, onToggle: () => void }} props
 */
function StoryRow({ story, selected, onToggle }) {
    const cellStyle = { padding: "4px 6px", borderBottom: "1px solid rgba(255,255,255,0.08)", verticalAlign: "top" };
    const rowStyle = selected ? { background: "rgba(255,255,255,0.1)" } : {};

    return React.createElement("tr", { style: rowStyle },
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } },
            React.createElement("input", {
                type: "checkbox",
                checked: selected,
                onChange: onToggle,
            })
        ),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getCreateTime(story)?.toLocaleString() ?? ""),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, story.post_id),
        React.createElement("td", { style: { ...cellStyle, width: "50vw", maxWidth: "50vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, (story.message?.text ?? "").slice(0, 500)),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, story.attached_story ? "true" : "false"),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getAttachmentCount(story))
    );
}

/**
 * @param {{ stories: Story[], selectedIds: Set<string>, onToggleStory: (id: string) => void, onToggleAll: () => void }} props
 */
function StoryTable({ stories, selectedIds, onToggleStory, onToggleAll }) {
    const allSelected = stories.length > 0 && stories.every(s => selectedIds.has(s.id));

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

    return React.createElement("table", { style: tableStyle },
        React.createElement("thead", null,
            React.createElement("tr", null,
                React.createElement("th", { style: thStyle },
                    React.createElement("input", {
                        type: "checkbox",
                        checked: allSelected,
                        onChange: onToggleAll,
                    })
                ),
                React.createElement("th", { style: thStyle }, "Created"),
                React.createElement("th", { style: thStyle }, "Post ID"),
                React.createElement("th", { style: { ...thStyle, width: "50vw" } }, "Message"),
                React.createElement("th", { style: thStyle }, "Attached Story"),
                React.createElement("th", { style: thStyle }, "Attachments")
            )
        ),
        React.createElement("tbody", null,
            stories.map((story) =>
                React.createElement(StoryRow, {
                    key: story.id,
                    story,
                    selected: selectedIds.has(story.id),
                    onToggle: () => onToggleStory(story.id),
                })
            )
        )
    );
}

/**
 * @param {{ stories: Story[], onDownloadFile: (url: string, filename: string) => void, onClose: () => void }} props
 */
function StoryDialog({ stories, onDownloadFile, onClose }) {
    const [selectedIds, setSelectedIds] = useState(/** @type {Set<string>} */(new Set()));
    const [downloading, setDownloading] = useState(false);

    const onToggleStory = useCallback((/** @type {string} */ id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const onToggleAll = useCallback(() => {
        setSelectedIds(prev => {
            const allSelected = stories.every(s => prev.has(s.id));
            if (allSelected) {
                return new Set();
            } else {
                return new Set(stories.map(s => s.id));
            }
        });
    }, [stories]);

    const handleDownload = useCallback(async () => {
        if (selectedIds.size === 0 || downloading) return;

        setDownloading(true);
        try {
            const selectedStories = stories.filter(s => selectedIds.has(s.id));
            for (let i = 0; i < selectedStories.length; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 1000));
                await downloadStory(selectedStories[i], onDownloadFile);
            }
        } catch (err) {
            console.warn("[fpdl] download failed", err);
        } finally {
            setDownloading(false);
        }
    }, [selectedIds, stories, onDownloadFile, downloading]);

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
        flex: 1,
        textAlign: "center",
    };

    const buttonStyle = {
        fontSize: "11px",
        padding: "2px 8px",
        borderRadius: "4px",
        border: "1px solid rgba(255,255,255,0.35)",
        background: "rgba(255,255,255,0.12)",
        color: "#fff",
        cursor: downloading || selectedIds.size === 0 ? "not-allowed" : "pointer",
        opacity: downloading || selectedIds.size === 0 ? 0.5 : 1,
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

    return React.createElement("div", { style: containerStyle },
        React.createElement("div", { style: headerStyle },
            React.createElement("button", {
                type: "button",
                style: buttonStyle,
                onClick: handleDownload,
                disabled: downloading || selectedIds.size === 0,
            }, downloading ? "Downloading…" : `Download (${selectedIds.size})`),
            React.createElement("div", { style: titleStyle }, "Facebook Post Downloader"),
            React.createElement("button", {
                type: "button",
                style: closeButtonStyle,
                onClick: onClose,
                title: "Close",
            }, "×")
        ),
        React.createElement(StoryTable, { stories, selectedIds, onToggleStory, onToggleAll })
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

    // Update badge count when stories change
    useEffect(() => {
        window.postMessage({ __fpdl: true, type: "FPDL_STORY_COUNT", count: stories.length }, window.location.origin);
    }, [stories.length]);

    // Inject download buttons when stories change
    useDownloadButtonInjection(stories, onDownloadFile);

    if (!visible) return null;

    return React.createElement(StoryDialog, { stories, onDownloadFile, onClose });
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
