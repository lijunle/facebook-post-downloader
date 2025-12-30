import "../node_modules/@microsoft/applicationinsights-web/dist/es5/applicationinsights-web.min.js";

/**
 * @typedef {import("./types").AppMessage} AppMessage
 * @typedef {import("./types").ChromeMessageToggle} ChromeMessageToggle
 * @typedef {import("./types").ChromeMessageDownloadResult} ChromeMessageDownloadResult
 * @typedef {import("./types").StoryFile} StoryFile
 */

/**
 * @type {import("@microsoft/applicationinsights-web")}
 */
// @ts-ignore
const ApplicationInsightsModule = globalThis.Microsoft.ApplicationInsights;

// Initialize Application Insights
const appInsights = new ApplicationInsightsModule.ApplicationInsights({
  config: {
    connectionString:
      "InstrumentationKey=0b8a6a27-3b94-4411-aa58-bc5ff386cd7d;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/;ApplicationId=a4e17229-ea4c-42c3-b219-cee1fdb2e9b9",
    enableAutoRouteTracking: false,
    enableAjaxErrorStatusText: true,
  },
});
appInsights.loadAppInsights();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/** @type {Map<number, StoryFile & { tabId: number | undefined }>} */
const activeDownloadItems = new Map();

/**
 * Resets the active downloads (for testing).
 */
export function resetActiveDownloads() {
  activeDownloadItems.clear();
}

/**
 * Downloads a file with retry mechanism.
 *
 * On successful download initiation, the download is tracked in activeDownloadItems.
 * When the download completes (via chrome.downloads.onChanged), a FPDL_DOWNLOAD_COMPLETE
 * message is sent to the originating tab to notify the content script.
 *
 * @param {string} storyId - The story ID.
 * @param {string} url - The URL to download.
 * @param {string} filename - The filename to save as.
 * @param {number | undefined} tabId - The tab ID to notify on completion.
 * @param {number} [attempt=1] - Current attempt number.
 */
export function downloadFile(storyId, url, filename, tabId, attempt = 1) {
  /** @type {StoryFile & { tabId: number | undefined }} */
  const item = { storyId, url, filename, tabId };
  chrome.downloads.download(
    {
      url: item.url,
      filename: item.filename,
      conflictAction: "overwrite",
      saveAs: false,
    },
    (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        console.error(
          `Download failed (attempt ${attempt}/${MAX_RETRIES}):`,
          chrome.runtime.lastError?.message || "Unknown error",
        );
        if (attempt < MAX_RETRIES) {
          setTimeout(
            () => downloadFile(storyId, url, filename, tabId, attempt + 1),
            RETRY_DELAY_MS,
          );
        } else {
          console.error(
            `Download failed after ${MAX_RETRIES} attempts: ${item.filename}`,
          );
          if (item.tabId) {
            /** @type {ChromeMessageDownloadResult} */
            const message = {
              type: "FPDL_DOWNLOAD_RESULT",
              storyId: item.storyId,
              url: item.url,
              filename: item.filename,
              status: "max_retries",
            };
            chrome.tabs.sendMessage(item.tabId, message);
          }
        }
      } else {
        activeDownloadItems.set(downloadId, item);
      }
    },
  );
}

chrome.downloads.onChanged.addListener((delta) => {
  const item = activeDownloadItems.get(delta.id);
  if (!item) return;

  /** @type {"success" | "interrupted" | undefined} */
  let status;
  if (delta.state?.current === "complete") {
    status = "success";
  } else if (delta.state?.current === "interrupted") {
    status = "interrupted";
  }

  if (status) {
    activeDownloadItems.delete(delta.id);
    if (item.tabId) {
      /** @type {ChromeMessageDownloadResult} */
      const message = {
        type: "FPDL_DOWNLOAD_RESULT",
        storyId: item.storyId,
        url: item.url,
        filename: item.filename,
        status,
      };
      chrome.tabs.sendMessage(item.tabId, message);
    }
  }
});

/**
 * Updates the extension badge with the story count.
 * @param {number} count - The number of stories to display.
 * @param {number | undefined} tabId - The tab ID to update the badge for.
 */
export function updateBadge(count, tabId) {
  if (!tabId) return;
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#4267B2", tabId });
}

chrome.runtime.onMessage.addListener(
  (/** @type {AppMessage} */ msg, sender) => {
    if (msg.type === "FPDL_STORY_COUNT") {
      updateBadge(msg.count, sender.tab?.id);
    } else if (msg.type === "FPDL_DOWNLOAD") {
      downloadFile(msg.storyId, msg.url, msg.filename, sender.tab?.id);
    } else if (msg.type === "FPDL_TRACK_EVENT") {
      appInsights.trackEvent({
        name: msg.name,
        properties: msg.properties,
      });
    }
  },
);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    /** @type {ChromeMessageToggle} */
    const message = { type: "FPDL_TOGGLE" };
    chrome.tabs.sendMessage(tab.id, message);
  }
});
