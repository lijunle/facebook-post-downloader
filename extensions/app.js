import {
  storyListener,
  downloadStory,
  getAttachmentCount,
  getDownloadCount,
  getCreateTime,
  isStoryPost,
  getStoryPostId,
  getStoryMessage,
  getStoryId,
} from "./story.js";
import { React, ReactDOM } from "./react.js";
import { useDownloadButtonInjection } from "./download-button.js";

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
        callback(
          /** @type {Extract<ChromeMessage, { type: T }>} */ (event.data),
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
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
 * Inject the styles for the FPDL UI.
 */
function injectStyles() {
  if (document.getElementById("fpdl-styles")) return;

  const style = document.createElement("style");
  style.id = "fpdl-styles";
  style.textContent = `
        .fpdl-container {
            position: fixed;
            left: 12px;
            bottom: 12px;
            z-index: 2147483647;
            max-width: 90vw;
            max-height: 80vh;
            overflow: auto;
            background: rgba(0, 0, 0, 0.5);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 6px;
            padding: 8px;
        }
        .fpdl-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        .fpdl-title {
            font-size: 12px;
            font-weight: 700;
            user-select: none;
            flex: 1;
            text-align: center;
        }
        .fpdl-btn {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.35);
            background: rgba(255,255,255,0.12);
            color: #fff;
            cursor: pointer;
        }
        .fpdl-btn:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
        .fpdl-close-btn {
            background: transparent;
            border: none;
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            opacity: 0.7;
        }
        .fpdl-close-btn:hover {
            opacity: 1;
        }
        .fpdl-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .fpdl-th {
            text-align: left;
            padding: 4px 6px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
            white-space: nowrap;
        }
        .fpdl-th-checkbox {
            width: 40px;
            min-width: 40px;
        }
        .fpdl-th-message {
            width: 50vw;
        }
        .fpdl-td {
            padding: 4px 6px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            vertical-align: middle;
            height: 24px;
            white-space: nowrap;
        }
        .fpdl-td-checkbox {
            width: 40px;
            min-width: 40px;
        }
        .fpdl-td-message {
            width: 50vw;
            max-width: 50vw;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .fpdl-row-selected {
            background: rgba(255,255,255,0.1);
        }
        .fpdl-row-pending {
            background: rgba(128, 128, 128, 0.3);
        }
        .fpdl-row-downloading {
            animation: fpdl-blink 1s ease-in-out infinite;
        }
        @keyframes fpdl-blink {
            0%, 100% { background: rgba(255, 200, 0, 0.2); }
            50% { background: rgba(255, 200, 0, 0.4); }
        }
        .fpdl-row-downloaded {
            background: rgba(0, 200, 0, 0.2);
        }
        .fpdl-table tbody tr:hover {
            outline: 1px solid rgba(255, 255, 255, 0.5);
            outline-offset: -1px;
        }
    `;
  document.head.appendChild(style);
}

/**
 * @param {{ story: Story, selected: boolean, onToggle: () => void, downloadedCount: number | undefined }} props
 */
function StoryRow({ story, selected, onToggle, downloadedCount }) {
  const total = getDownloadCount(story);
  const isPending = downloadedCount === 0;
  const isDownloading =
    downloadedCount !== undefined &&
    downloadedCount > 0 &&
    downloadedCount < total;
  const isDownloaded =
    downloadedCount !== undefined && downloadedCount >= total;

  let className = undefined;
  if (isDownloaded) {
    className = "fpdl-row-downloaded";
  } else if (isDownloading) {
    className = "fpdl-row-downloading";
  } else if (isPending) {
    className = "fpdl-row-pending";
  } else if (selected) {
    className = "fpdl-row-selected";
  }

  return React.createElement(
    "tr",
    {
      className,
      onClick: downloadedCount === undefined ? onToggle : undefined,
      style: downloadedCount === undefined ? { cursor: "pointer" } : undefined,
    },
    React.createElement(
      "td",
      { className: "fpdl-td fpdl-td-checkbox" },
      downloadedCount !== undefined
        ? `${downloadedCount}/${total}`
        : React.createElement("input", {
            type: "checkbox",
            checked: selected,
            onChange: onToggle,
            onClick: (/** @type {MouseEvent} */ e) => e.stopPropagation(),
          }),
    ),
    React.createElement(
      "td",
      { className: "fpdl-td" },
      getCreateTime(story)?.toLocaleString() ?? "",
    ),
    React.createElement("td", { className: "fpdl-td" }, getStoryPostId(story)),
    React.createElement(
      "td",
      { className: "fpdl-td fpdl-td-message" },
      (getStoryMessage(story) ?? "").slice(0, 500),
    ),
    React.createElement(
      "td",
      { className: "fpdl-td" },
      isStoryPost(story) && story.attached_story ? "true" : "false",
    ),
    React.createElement(
      "td",
      { className: "fpdl-td" },
      getAttachmentCount(story),
    ),
  );
}

/**
 * @param {{ stories: Story[], selectedIds: Set<string>, onToggleStory: (id: string) => void, onToggleAll: () => void, downloadedStories: { [storyId: string]: number } }} props
 */
function StoryTable({
  stories,
  selectedIds,
  onToggleStory,
  onToggleAll,
  downloadedStories,
}) {
  const selectableStories = stories.filter(
    (s) => !(getStoryId(s) in downloadedStories),
  );
  const allSelected =
    selectableStories.length > 0 &&
    selectableStories.every((s) => selectedIds.has(getStoryId(s)));

  return React.createElement(
    "table",
    { className: "fpdl-table" },
    React.createElement(
      "thead",
      null,
      React.createElement(
        "tr",
        null,
        React.createElement(
          "th",
          { className: "fpdl-th fpdl-th-checkbox" },
          React.createElement("input", {
            type: "checkbox",
            checked: allSelected,
            onChange: onToggleAll,
            disabled: selectableStories.length === 0,
          }),
        ),
        React.createElement("th", { className: "fpdl-th" }, "Created"),
        React.createElement("th", { className: "fpdl-th" }, "Post ID"),
        React.createElement(
          "th",
          { className: "fpdl-th fpdl-th-message" },
          "Message",
        ),
        React.createElement("th", { className: "fpdl-th" }, "Attached Story"),
        React.createElement("th", { className: "fpdl-th" }, "Attachments"),
      ),
    ),
    React.createElement(
      "tbody",
      null,
      stories.map((story) =>
        React.createElement(StoryRow, {
          key: getStoryId(story),
          story,
          selected: selectedIds.has(getStoryId(story)),
          onToggle: () => onToggleStory(getStoryId(story)),
          downloadedCount: downloadedStories[getStoryId(story)],
        }),
      ),
    ),
  );
}

/**
 * Custom hook to manage hide button logic
 * @param {{ selectedIds: Set<string>, visibleStories: Story[], downloadedStories: { [storyId: string]: number }, hiddenStories: Set<string>, setSelectedIds: (ids: Set<string>) => void, setHiddenStories: (updater: (prev: Set<string>) => Set<string>) => void }} params
 * @returns {{ label: string | null, action: (() => void) | null }}
 */
function useHideButton({
  selectedIds,
  visibleStories,
  downloadedStories,
  hiddenStories,
  setSelectedIds,
  setHiddenStories,
}) {
  const downloadedStoryIds = visibleStories
    .filter((s) => {
      const id = getStoryId(s);
      const count = downloadedStories[id];
      return count !== undefined && count >= getDownloadCount(s);
    })
    .map((s) => getStoryId(s));

  const hideSelected = useCallback(() => {
    setHiddenStories((prev) => new Set([...prev, ...selectedIds]));
    setSelectedIds(new Set());
  }, [selectedIds, setHiddenStories, setSelectedIds]);

  const hideDownloaded = useCallback(() => {
    setHiddenStories((prev) => new Set([...prev, ...downloadedStoryIds]));
    setSelectedIds(new Set());
  }, [downloadedStoryIds, setHiddenStories, setSelectedIds]);

  const unhide = useCallback(() => {
    setHiddenStories(() => new Set());
    setSelectedIds(new Set());
  }, [setHiddenStories, setSelectedIds]);

  let label = null;
  let action = null;

  if (selectedIds.size > 0) {
    label = `Hide selected (${selectedIds.size})`;
    action = hideSelected;
  } else if (downloadedStoryIds.length > 0) {
    label = `Hide downloaded (${downloadedStoryIds.length})`;
    action = hideDownloaded;
  } else if (hiddenStories.size > 0) {
    label = `Unhide (${hiddenStories.size})`;
    action = unhide;
  }

  return { label, action };
}

/**
 * Custom hook to manage story listening and badge count updates
 * @param {{ initialStories: Story[], onStory: (cb: (story: Story) => void) => void }} params
 * @returns {Story[]}
 */
function useStoryListener({ initialStories, onStory }) {
  const [stories, setStories] = useState(initialStories);

  // Subscribe to new stories
  useEffect(() => {
    onStory((story) => {
      setStories((prev) => [...prev, story]);
    });
  }, [onStory]);

  // Update badge count when stories change
  useEffect(() => {
    sendAppMessage({ type: "FPDL_STORY_COUNT", count: stories.length });
  }, [stories.length]);

  return stories;
}

/**
 * Custom hook to manage downloaded stories state
 * @returns {{ downloadedStories: { [storyId: string]: number }, setDownloadedStories: React.Dispatch<React.SetStateAction<{ [storyId: string]: number }>> }}
 */
function useDownloadedStories() {
  const [downloadedStories, setDownloadedStories] = useState(
    /** @type {{ [storyId: string]: number }} */ ({}),
  );

  useChromeMessage(
    "FPDL_DOWNLOAD_COMPLETE",
    useCallback((message) => {
      setDownloadedStories((prev) => ({
        ...prev,
        [message.storyId]: (prev[message.storyId] ?? 0) + 1,
      }));
    }, []),
  );

  return { downloadedStories, setDownloadedStories };
}

/**
 * @param {{ initialStories: Story[], onStory: (cb: (story: Story) => void) => void }} props
 */
function App({ initialStories, onStory }) {
  const stories = useStoryListener({ initialStories, onStory });
  const { downloadedStories, setDownloadedStories } = useDownloadedStories();
  const [visible, setVisible] = useState(false);
  const hasRendered = React.useRef(false);
  const [hiddenStories, setHiddenStories] = useState(
    /** @type {Set<string>} */ (new Set()),
  );
  const [selectedIds, setSelectedIds] = useState(
    /** @type {Set<string>} */ (new Set()),
  );

  /**
   * Download file callback
   * @param {string} storyId
   * @param {string} url
   * @param {string} filename
   */
  const downloadFile = (storyId, url, filename) => {
    sendAppMessage({ type: "FPDL_DOWNLOAD", storyId, url, filename });
  };

  const onClose = useCallback(() => {
    setVisible(false);
    setSelectedIds(new Set());
  }, []);

  const onToggleStory = useCallback((/** @type {string} */ id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const visibleStories = stories.filter(
    (s) => !hiddenStories.has(getStoryId(s)),
  );

  const onToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = visibleStories.every((s) => prev.has(getStoryId(s)));
      if (allSelected) {
        return new Set();
      } else {
        return new Set(visibleStories.map((s) => getStoryId(s)));
      }
    });
  }, [visibleStories]);

  const handleDownload = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const selectedStories = visibleStories
      .filter((s) => selectedIds.has(getStoryId(s)))
      .filter((s) => !(getStoryId(s) in downloadedStories));
    if (selectedStories.length === 0) return;

    setSelectedIds(new Set());
    setDownloadedStories((prev) => {
      const next = { ...prev };
      for (const story of selectedStories) {
        next[getStoryId(story)] = 0;
      }
      return next;
    });

    for (let i = 0; i < selectedStories.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 500));
      const story = selectedStories[i];
      try {
        await downloadStory(story, downloadFile);
      } catch (err) {
        console.error(
          "[fpdl] download failed for story",
          getStoryId(story),
          err,
        );
      }
    }
  }, [selectedIds, visibleStories, downloadedStories, setDownloadedStories]);

  const { label: hideButtonLabel, action: hideButtonAction } = useHideButton({
    selectedIds,
    visibleStories,
    downloadedStories,
    hiddenStories,
    setSelectedIds,
    setHiddenStories,
  });

  // Listen for toggle messages - scroll to trigger load on first render
  useChromeMessage(
    "FPDL_TOGGLE",
    useCallback(() => {
      if (!hasRendered.current) {
        hasRendered.current = true;
        window.scrollBy(0, 1);
      }
      setVisible((v) => !v);
    }, []),
  );

  // Inject download buttons when stories change
  useDownloadButtonInjection(stories, downloadFile);

  if (!visible) return null;

  return React.createElement(
    "div",
    { className: "fpdl-container" },
    React.createElement(
      "div",
      { className: "fpdl-header" },
      React.createElement(
        "button",
        {
          type: "button",
          className: "fpdl-btn",
          onClick: handleDownload,
          disabled: selectedIds.size === 0,
        },
        `Download (${selectedIds.size})`,
      ),
      hideButtonLabel
        ? React.createElement(
            "button",
            {
              type: "button",
              className: "fpdl-btn",
              onClick: hideButtonAction,
              style: { marginLeft: "8px" },
            },
            hideButtonLabel,
          )
        : null,
      React.createElement(
        "div",
        { className: "fpdl-title" },
        `Facebook Post Downloader (${visibleStories.length})`,
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "fpdl-close-btn",
          onClick: onClose,
          title: "Close",
        },
        "×",
      ),
    ),
    React.createElement(StoryTable, {
      stories: visibleStories,
      selectedIds,
      onToggleStory,
      onToggleAll,
      downloadedStories,
    }),
  );
}

function run() {
  // Inject styles first
  injectStyles();

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

  const container = document.createElement("div");
  container.id = "fpdl-post-table-root";
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);

  root.render(
    React.createElement(App, {
      initialStories: collectedStories,
      onStory: (cb) => {
        storyCallback = cb;
      },
    }),
  );
}

run();
