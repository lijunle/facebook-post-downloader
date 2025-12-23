import { storyListener, downloadStory, getAttachmentCount, getCreateTime, isStoryPost, getStoryPostId, getStoryMessage, getStoryId } from './story.js';
import { React, ReactDOM } from './react.js';
import { useDownloadButtonInjection } from './download-button.js';

/**
 * @typedef {import('./types').Story} Story
 * @typedef {import('./types').AppMessage} AppMessage
 * @typedef {import('./types').ChromeMessage} ChromeMessage
 */

const { useState, useEffect, useCallback } = React;

/**
 * Hook to listen for Chrome extension messages of a specific type.
 * @template {ChromeMessage['type']} T
 * @param {T} type - The message type to listen for.
 * @param {(message: Extract<ChromeMessage, { type: T }>) => void} callback - Callback invoked when a matching message is received.
 */
function useChromeMessage(type, callback) {
    useEffect(() => {
        /** @param {MessageEvent<ChromeMessage & { __fpdl?: boolean }>} event */
        const listener = (event) => {
            if (event.source !== window) return;
            if (!event.data.__fpdl) return;
            if (event.data.type === type) {
                callback(/** @type {Extract<ChromeMessage, { type: T }>} */(event.data));
            }
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [type, callback]);
}

/**
 * Sends a message to the content script.
 * @param {AppMessage} message
 */
function sendAppMessage(message) {
    window.postMessage({ __fpdl: true, ...message }, window.location.origin);
}

/**
 * @param {{ story: Story, selected: boolean, onToggle: () => void, downloadedCount: number | undefined }} props
 */
function StoryRow({ story, selected, onToggle, downloadedCount }) {
    const cellStyle = { padding: "4px 6px", borderBottom: "1px solid rgba(255,255,255,0.08)", verticalAlign: "middle", height: "24px" };
    const rowStyle = selected ? { background: "rgba(255,255,255,0.1)" } : {};
    const total = getAttachmentCount(story) + 1;

    return React.createElement("tr", { style: rowStyle },
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap", width: "40px", minWidth: "40px" } },
            downloadedCount !== undefined
                ? `${downloadedCount}/${total}`
                : React.createElement("input", {
                    type: "checkbox",
                    checked: selected,
                    onChange: onToggle,
                })
        ),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getCreateTime(story)?.toLocaleString() ?? ""),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getStoryPostId(story)),
        React.createElement("td", { style: { ...cellStyle, width: "50vw", maxWidth: "50vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, (getStoryMessage(story) ?? "").slice(0, 500)),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, isStoryPost(story) && story.attached_story ? "true" : "false"),
        React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap" } }, getAttachmentCount(story))
    );
}

/**
 * @param {{ stories: Story[], selectedIds: Set<string>, onToggleStory: (id: string) => void, onToggleAll: () => void, downloadedCountMap: { [storyId: string]: number } }} props
 */
function StoryTable({ stories, selectedIds, onToggleStory, onToggleAll, downloadedCountMap }) {
    const allSelected = stories.length > 0 && stories.every(s => selectedIds.has(getStoryId(s)));

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
                React.createElement("th", { style: { ...thStyle, width: "40px", minWidth: "40px" } },
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
                    key: getStoryId(story),
                    story,
                    selected: selectedIds.has(getStoryId(story)),
                    onToggle: () => onToggleStory(getStoryId(story)),
                    downloadedCount: downloadedCountMap[getStoryId(story)],
                })
            )
        )
    );
}

/**
 * @param {{ stories: Story[], onDownloadFile: (storyId: string, url: string, filename: string) => void, onClose: () => void }} props
 */
function StoryDialog({ stories, onDownloadFile, onClose }) {
    const [selectedIds, setSelectedIds] = useState(/** @type {Set<string>} */(new Set()));
    const [downloadedCountMap, setDownloadedCountMap] = useState(/** @type {{ [storyId: string]: number }} */({}));

    useChromeMessage('FPDL_DOWNLOAD_COMPLETE', useCallback((message) => {
        setDownloadedCountMap(prev => ({
            ...prev,
            [message.storyId]: (prev[message.storyId] ?? 0) + 1,
        }));
    }, []));

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
            const allSelected = stories.every(s => prev.has(getStoryId(s)));
            if (allSelected) {
                return new Set();
            } else {
                return new Set(stories.map(s => getStoryId(s)));
            }
        });
    }, [stories]);

    const handleDownload = useCallback(async () => {
        if (selectedIds.size === 0) return;

        setDownloadedCountMap(prev => {
            const next = { ...prev };
            for (const storyId of selectedIds) {
                next[storyId] = 0;
            }
            return next;
        });

        const selectedStories = stories.filter(s => selectedIds.has(getStoryId(s)));
        setSelectedIds(new Set());

        for (let i = 0; i < selectedStories.length; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 500));
            const story = selectedStories[i];
            await downloadStory(story, onDownloadFile);
        }
    }, [selectedIds, stories, onDownloadFile]);

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
        cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
        opacity: selectedIds.size === 0 ? 0.5 : 1,
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
                disabled: selectedIds.size === 0,
            }, `Download (${selectedIds.size})`),
            React.createElement("div", { style: titleStyle }, `Facebook Post Downloader (${stories.length})`),
            React.createElement("button", {
                type: "button",
                style: closeButtonStyle,
                onClick: onClose,
                title: "Close",
            }, "×")
        ),
        React.createElement(StoryTable, { stories, selectedIds, onToggleStory, onToggleAll, downloadedCountMap })
    );
}

/**
 * @param {{ initialStories: Story[], onStory: (cb: (story: Story) => void) => void }} props
 */
function App({ initialStories, onStory }) {
    const [stories, setStories] = useState(initialStories);
    const [visible, setVisible] = useState(false);

    const onDownloadFile = useCallback(
        /** @param {string} storyId @param {string} url @param {string} filename */
        (storyId, url, filename) => {
            sendAppMessage({ type: "FPDL_DOWNLOAD", storyId, url, filename });
        }, []);

    const onClose = useCallback(() => {
        setVisible(false);
    }, []);

    // Listen for toggle messages
    useChromeMessage('FPDL_TOGGLE', useCallback(() => {
        setVisible(v => !v);
    }, []));

    // Subscribe to new stories
    useEffect(() => {
        onStory((story) => {
            setStories(prev => [...prev, story]);
        });
    }, [onStory]);

    // Update badge count when stories change
    useEffect(() => {
        sendAppMessage({ type: "FPDL_STORY_COUNT", count: stories.length });
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
