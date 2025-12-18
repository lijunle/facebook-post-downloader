import { fetchAttachments, getDownloadUrl, getAttachmentCount } from './story.js';
import { React } from './react.js';

const { useState, useCallback } = React;

/**
 * @param {{ story: import('./types').Story, postAppMessage: (url: string, filename: string) => void }} props
 */
export function StoryRow({ story, postAppMessage }) {
    const [downloading, setDownloading] = useState(false);

    const handleDownload = useCallback(async () => {
        try {
            setDownloading(true);

            await fetchAttachments(story, (media) => {
                const download = getDownloadUrl(media);
                if (!download) return;

                const filename = `${story.post_id}/${media.id}.${download.ext}`;
                postAppMessage(download.url, filename);
            });
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
        React.createElement("td", { style: { ...cellStyle, textAlign: "right", whiteSpace: "nowrap" } }, story.post_id),
        React.createElement("td", { style: { ...cellStyle, wordBreak: "break-word" } }, (story.message?.text ?? "").slice(0, 100)),
        React.createElement("td", { style: { ...cellStyle, textAlign: "right", whiteSpace: "nowrap" } },
            getAttachmentCount(story),
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
 * @param {{ stories: import('./types').Story[], postAppMessage: (url: string, filename: string) => void }} props
 */
export function StoryTable({ stories, postAppMessage }) {
    const recent = stories.slice(-50);

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
                recent.map((story) =>
                    React.createElement(StoryRow, { key: story.id, story, postAppMessage })
                )
            )
        )
    );
}
