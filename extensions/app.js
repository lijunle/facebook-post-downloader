import {
  storyListener,
  fetchStoryFiles,
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

const { useState, useEffect, useCallback, useMemo, useRef } = React;

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
 * Send a message to the content script.
 * @param {AppMessage} message
 */
function sendAppMessage(message) {
  window.postMessage({ __fpdl: true, ...message }, window.location.origin);
}

/**
 * Track an event.
 * @param {string} name
 * @param {Record<string, string | number | boolean>} [properties]
 */
function trackEvent(name, properties) {
  sendAppMessage({ type: "FPDL_TRACK_EVENT", name, properties });
}

/**
 * Download all files for a story.
 * @param {Story} story
 */
async function downloadStory(story) {
  for await (const { storyId, url, filename } of fetchStoryFiles(story)) {
    await new Promise((r) => setTimeout(r, 200));
    sendAppMessage({ type: "FPDL_DOWNLOAD", storyId, url, filename });
  }
}

/**
 * Inject styles for the FPDL UI.
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
        .fpdl-sponsor-btn {
            display: inline-block;
            background: transparent;
            border: none;
            color: #ff69b4;
            font-size: 16px;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            opacity: 0.7;
            margin-right: 8px;
        }
        .fpdl-sponsor-btn:hover {
            opacity: 1;
            text-decoration: none;
        }
        .fpdl-close-btn {
            display: inline-block;
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
 * Render a single story row in the table.
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
 * Render the story table with headers and rows.
 * @param {{ stories: Story[], selectedStories: Set<string>, toggleStory: (story: Story) => void, toggleAllStories: () => void, downloadingStories: { [storyId: string]: number } }} props
 */
function StoryTable({
  stories,
  selectedStories,
  toggleStory,
  toggleAllStories,
  downloadingStories,
}) {
  const selectableStories = stories.filter(
    (s) => !(getStoryId(s) in downloadingStories),
  );
  const allSelected =
    selectableStories.length > 0 &&
    selectableStories.every((s) => selectedStories.has(getStoryId(s)));

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
            onChange: toggleAllStories,
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
          selected: selectedStories.has(getStoryId(story)),
          onToggle: () => toggleStory(story),
          downloadedCount: downloadingStories[getStoryId(story)],
        }),
      ),
    ),
  );
}

/**
 * Render a button to hide/unhide stories based on current state.
 * @param {{ selectedStories: Set<string>, visibleStories: Story[], downloadingStories: { [storyId: string]: number }, hiddenStories: Set<string>, clearSelectedStories: () => void, setHiddenStories: (updater: (prev: Set<string>) => Set<string>) => void }} props
 */
function HideButton({
  selectedStories,
  visibleStories,
  downloadingStories,
  hiddenStories,
  clearSelectedStories,
  setHiddenStories,
}) {
  const downloadedStoryIds = useMemo(
    () =>
      visibleStories
        .filter((s) => {
          const id = getStoryId(s);
          const downloadingCount = downloadingStories[id];
          return downloadingCount === getDownloadCount(s);
        })
        .map((s) => getStoryId(s)),
    [visibleStories, downloadingStories],
  );

  const hideSelected = useCallback(() => {
    trackEvent("SelectedStoriesHidden", { count: selectedStories.size });
    setHiddenStories((prev) => new Set([...prev, ...selectedStories]));
    clearSelectedStories();
  }, [selectedStories, setHiddenStories, clearSelectedStories]);

  const hideDownloaded = useCallback(() => {
    trackEvent("DownloadedStoriesHidden", { count: downloadedStoryIds.length });
    setHiddenStories((prev) => new Set([...prev, ...downloadedStoryIds]));
    clearSelectedStories();
  }, [downloadedStoryIds, setHiddenStories, clearSelectedStories]);

  const unhide = useCallback(() => {
    trackEvent("StoriesUnhidden", { count: hiddenStories.size });
    setHiddenStories(() => new Set());
    clearSelectedStories();
  }, [hiddenStories.size, setHiddenStories, clearSelectedStories]);

  let label = null;
  let action = null;

  if (selectedStories.size > 0) {
    label = `Hide selected (${selectedStories.size})`;
    action = hideSelected;
  } else if (downloadedStoryIds.length > 0) {
    label = `Hide downloaded (${downloadedStoryIds.length})`;
    action = hideDownloaded;
  } else if (hiddenStories.size > 0) {
    label = `Unhide (${hiddenStories.size})`;
    action = unhide;
  }

  if (!label) return null;

  return React.createElement(
    "button",
    {
      type: "button",
      className: "fpdl-btn",
      onClick: action,
      style: { marginLeft: "8px" },
    },
    label,
  );
}

/**
 * Hook to manage dialog open/close state.
 * @param {{ clearSelectedStories: () => void }} params
 * @returns {{ open: boolean, closeDialog: () => void }}
 */
function useDialogOpen({ clearSelectedStories }) {
  const [open, setOpen] = useState(false);
  const hasRendered = React.useRef(false);

  const closeDialog = useCallback(() => {
    setOpen(false);
    clearSelectedStories();
    trackEvent("DialogClosed");
  }, [clearSelectedStories]);

  useChromeMessage(
    "FPDL_TOGGLE",
    useCallback(() => {
      if (!hasRendered.current) {
        hasRendered.current = true;
        window.scrollBy(0, 1);
      }
      setOpen((v) => {
        const newOpen = !v;
        trackEvent("DialogToggled", { open: newOpen });
        return newOpen;
      });
    }, []),
  );

  return { open, closeDialog };
}

/**
 * Hook to listen for new stories and update badge count.
 * @param {{ initialStories: Story[], onStory: (cb: (story: Story) => void) => void }} params
 * @returns {Story[]}
 */
function useStoryListener({ initialStories, onStory }) {
  const [stories, setStories] = useState(initialStories);

  useEffect(() => {
    onStory((story) => {
      setStories((prev) => [...prev, story]);
    });
  }, [onStory]);

  useEffect(() => {
    sendAppMessage({ type: "FPDL_STORY_COUNT", count: stories.length });
  }, [stories.length]);

  return stories;
}

/**
 * Hook to manage story selection state.
 * @param {{ stories: Story[], visibleStories: Story[] }} params
 * @returns {{ selectedStories: Set<string>, toggleStory: (story: Story) => void, toggleAllStories: () => void, clearSelectedStories: () => void }}
 */
function useSelectedStories({ stories, visibleStories }) {
  const [selectedStories, setSelectedStories] = useState(
    /** @type {Set<string>} */ (new Set()),
  );

  const toggleStory = useCallback(
    (/** @type {Story} */ story) => {
      const id = getStoryId(story);
      setSelectedStories((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          trackEvent("StoryDeselected", { storiesCount: stories.length });
        } else {
          next.add(id);
          trackEvent("StorySelected", { storiesCount: stories.length });
        }
        return next;
      });
    },
    [stories.length],
  );

  const toggleAllStories = useCallback(() => {
    setSelectedStories((prev) => {
      const allSelected = visibleStories.every((s) => prev.has(getStoryId(s)));
      if (allSelected) {
        trackEvent("AllStoriesDeselected", {
          visibleCount: visibleStories.length,
          storiesCount: stories.length,
        });
        return new Set();
      } else {
        trackEvent("AllStoriesSelected", {
          visibleCount: visibleStories.length,
          storiesCount: stories.length,
        });
        return new Set(visibleStories.map((s) => getStoryId(s)));
      }
    });
  }, [stories.length, visibleStories]);

  const clearSelectedStories = useCallback(() => {
    setSelectedStories(new Set());
  }, []);

  return {
    selectedStories,
    toggleStory,
    toggleAllStories,
    clearSelectedStories,
  };
}

/**
 * Hook to filter visible stories based on hidden state.
 * @param {{ stories: Story[] }} params
 * @returns {{ visibleStories: Story[], hiddenStories: Set<string>, setHiddenStories: React.Dispatch<React.SetStateAction<Set<string>>> }}
 */
function useVisibleStories({ stories }) {
  const [hiddenStories, setHiddenStories] = useState(
    /** @type {Set<string>} */ (new Set()),
  );

  const visibleStories = useMemo(
    () => stories.filter((s) => !hiddenStories.has(getStoryId(s))),
    [stories, hiddenStories],
  );

  return { visibleStories, hiddenStories, setHiddenStories };
}

/**
 * Hook to manage story download state and download logic.
 * @param {{ stories: Story[], visibleStories: Story[], selectedStories: Set<string>, clearSelectedStories: () => void }} params
 * @returns {{ downloadingStories: { [storyId: string]: number }, downloadStories: () => void }}
 */
function useDownloadingStories({
  stories,
  visibleStories,
  selectedStories,
  clearSelectedStories,
}) {
  const [downloadingStories, setDownloadingStories] = useState(
    /** @type {{ [storyId: string]: number }} */ ({}),
  );
  const downloadQueueRef = React.useRef(/** @type {Story[]} */ ([]));
  const isProcessingRef = React.useRef(false);

  useChromeMessage(
    "FPDL_DOWNLOAD_RESULT",
    useCallback((message) => {
      setDownloadingStories((prev) => ({
        ...prev,
        [message.storyId]: (prev[message.storyId] ?? 0) + 1,
      }));
    }, []),
  );

  const processDownloadQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (downloadQueueRef.current.length === 0) return;

    isProcessingRef.current = true;

    while (downloadQueueRef.current.length > 0) {
      const story = downloadQueueRef.current.shift();
      if (!story) break;

      try {
        await downloadStory(story);
      } catch (err) {
        console.error(
          "[fpdl] download failed for story",
          getStoryId(story),
          err,
        );
      }

      if (downloadQueueRef.current.length > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    isProcessingRef.current = false;
  }, []);

  const downloadStories = useCallback(() => {
    const storiesToDownload = visibleStories.filter((s) =>
      selectedStories.has(getStoryId(s)),
    );
    if (storiesToDownload.length === 0) return;

    trackEvent("DownloadClicked", {
      downloadCount: storiesToDownload.length,
      visibleCount: visibleStories.length,
      storiesCount: stories.length,
    });

    clearSelectedStories();

    // Mark stories as queued (0 downloads) for UI feedback
    setDownloadingStories((prev) => {
      const next = { ...prev };
      for (const story of storiesToDownload) {
        next[getStoryId(story)] = 0;
      }
      return next;
    });

    // Add stories to queue
    downloadQueueRef.current.push(...storiesToDownload);

    // Start processing the queue
    processDownloadQueue();
  }, [
    selectedStories,
    visibleStories,
    clearSelectedStories,
    processDownloadQueue,
  ]);

  return { downloadingStories, downloadStories };
}

/**
 * Main application component for the Facebook Post Downloader.
 * @param {{ initialStories: Story[], onStory: (cb: (story: Story) => void) => void }} props
 */
function App({ initialStories, onStory }) {
  const stories = useStoryListener({ initialStories, onStory });
  const { visibleStories, hiddenStories, setHiddenStories } = useVisibleStories(
    { stories },
  );
  const {
    selectedStories,
    toggleStory,
    toggleAllStories,
    clearSelectedStories,
  } = useSelectedStories({ stories, visibleStories });
  const { downloadingStories, downloadStories } = useDownloadingStories({
    stories,
    visibleStories,
    selectedStories,
    clearSelectedStories,
  });

  const { open, closeDialog } = useDialogOpen({ clearSelectedStories });

  const downloadingCountRef = useRef({ downloadingCount: 0, storiesCount: 0 });
  downloadingCountRef.current = {
    downloadingCount: Object.keys(downloadingStories).length,
    storiesCount: stories.length,
  };

  useEffect(() => {
    const handleUnload = () => {
      trackEvent("PageUnloaded", downloadingCountRef.current);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  useDownloadButtonInjection(
    stories,
    useCallback(async (story) => {
      trackEvent("InjectedDownloadClicked", downloadingCountRef.current);
      await downloadStory(story);
    }, []),
  );

  if (!open) return null;

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
          onClick: downloadStories,
          disabled: selectedStories.size === 0,
        },
        `Download (${selectedStories.size})`,
      ),
      React.createElement(HideButton, {
        selectedStories,
        visibleStories,
        downloadingStories,
        hiddenStories,
        clearSelectedStories,
        setHiddenStories,
      }),
      React.createElement(
        "div",
        { className: "fpdl-title" },
        `Facebook Post Downloader (${visibleStories.length})`,
      ),
      React.createElement(
        "a",
        {
          className: "fpdl-sponsor-btn",
          href: "https://github.com/sponsors/lijunle",
          target: "_blank",
          rel: "noopener noreferrer",
          title: "Sponsor",
          onClick: () =>
            trackEvent("SponsorClicked", downloadingCountRef.current),
        },
        "♥",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "fpdl-close-btn",
          onClick: closeDialog,
          title: "Close",
        },
        "×",
      ),
    ),
    React.createElement(StoryTable, {
      stories: visibleStories,
      selectedStories,
      toggleStory,
      toggleAllStories,
      downloadingStories,
    }),
  );
}

function run() {
  injectStyles();

  /** @type {Story[]} */
  const collectedStories = [];
  /** @type {((story: Story) => void) | null} */
  let storyCallback = null;

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
