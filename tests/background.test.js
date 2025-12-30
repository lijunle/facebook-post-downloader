import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

// Mock chrome API before importing the module
const downloadMock = mock.fn();
/** @type {Function[]} */
const onMessageListeners = [];
/** @type {Function[]} */
const onChangedListeners = [];
const mockChrome = {
  downloads: {
    download: downloadMock,
    onChanged: {
      addListener: (/** @type {Function} */ fn) => onChangedListeners.push(fn),
    },
  },
  runtime: {
    /** @type {{ message: string } | null} */
    lastError: null,
    onMessage: {
      addListener: (/** @type {Function} */ fn) => onMessageListeners.push(fn),
    },
  },
  action: {
    setBadgeText: mock.fn(),
    setBadgeBackgroundColor: mock.fn(),
    onClicked: { addListener: mock.fn() },
  },
  tabs: {
    sendMessage: mock.fn(),
  },
};
globalThis.chrome = mockChrome;

/**
 * Simulate a download state change event.
 * @param {number} downloadId
 * @param {"complete" | "interrupted"} state
 */
function simulateDownloadComplete(downloadId, state = "complete") {
  for (const listener of onChangedListeners) {
    listener({ id: downloadId, state: { current: state } });
  }
}

const { downloadFile, resetQueue, updateBadge } =
  await import("../extensions/background.js");

describe("updateBadge", () => {
  beforeEach(() => {
    mockChrome.action.setBadgeText.mock.resetCalls();
    mockChrome.action.setBadgeBackgroundColor.mock.resetCalls();
  });

  it("should set badge text with count when count > 0", () => {
    updateBadge(5, 123);

    assert.strictEqual(mockChrome.action.setBadgeText.mock.callCount(), 1);
    const [textArgs] = mockChrome.action.setBadgeText.mock.calls[0].arguments;
    assert.strictEqual(textArgs.text, "5");
    assert.strictEqual(textArgs.tabId, 123);

    assert.strictEqual(
      mockChrome.action.setBadgeBackgroundColor.mock.callCount(),
      1,
    );
    const [colorArgs] =
      mockChrome.action.setBadgeBackgroundColor.mock.calls[0].arguments;
    assert.strictEqual(colorArgs.color, "#4267B2");
    assert.strictEqual(colorArgs.tabId, 123);
  });

  it("should set empty badge text when count is 0", () => {
    updateBadge(0, 123);

    assert.strictEqual(mockChrome.action.setBadgeText.mock.callCount(), 1);
    const [textArgs] = mockChrome.action.setBadgeText.mock.calls[0].arguments;
    assert.strictEqual(textArgs.text, "");
    assert.strictEqual(textArgs.tabId, 123);

    // Background color is always set regardless of count
    assert.strictEqual(
      mockChrome.action.setBadgeBackgroundColor.mock.callCount(),
      1,
    );
  });

  it("should not set badge when tabId is undefined", () => {
    updateBadge(5, undefined);

    assert.strictEqual(mockChrome.action.setBadgeText.mock.callCount(), 0);
    assert.strictEqual(
      mockChrome.action.setBadgeBackgroundColor.mock.callCount(),
      0,
    );
  });
});

describe("downloadFile", () => {
  beforeEach(() => {
    downloadMock.mock.resetCalls();
    mockChrome.tabs.sendMessage.mock.resetCalls();
    mockChrome.runtime.lastError = null;
    resetQueue();
  });

  it("should start a download immediately", () => {
    // Simulate successful download
    downloadMock.mock.mockImplementation((options, callback) => {
      callback(12345); // downloadId
    });

    downloadFile(
      "story1",
      "https://example.com/file.jpg",
      "test.jpg",
      undefined,
    );

    assert.strictEqual(downloadMock.mock.callCount(), 1);
    const [options] = downloadMock.mock.calls[0].arguments;
    assert.strictEqual(options.url, "https://example.com/file.jpg");
    assert.strictEqual(options.filename, "test.jpg");
    assert.strictEqual(options.conflictAction, "overwrite");
    assert.strictEqual(options.saveAs, false);
  });

  it("should notify on download complete", () => {
    let nextDownloadId = 1;
    downloadMock.mock.mockImplementation((options, callback) => {
      callback(nextDownloadId++);
    });

    downloadFile("story1", "https://example.com/file.jpg", "test.jpg", 123);

    // Complete the download via onChanged event
    simulateDownloadComplete(1);

    // Should have sent a message to the tab
    assert.strictEqual(mockChrome.tabs.sendMessage.mock.callCount(), 1);
    const [tabId, message] =
      mockChrome.tabs.sendMessage.mock.calls[0].arguments;
    assert.strictEqual(tabId, 123);
    assert.strictEqual(message.type, "FPDL_DOWNLOAD_COMPLETE");
    assert.strictEqual(message.storyId, "story1");
  });

  it("should retry download on failure", async () => {
    const consoleErrorMock = mock.fn();
    const originalConsoleError = console.error;
    console.error = consoleErrorMock;

    /** @type {((downloadId: number | undefined) => void)[]} */
    const callbacks = [];
    downloadMock.mock.mockImplementation((options, callback) => {
      callbacks.push(callback);
    });

    downloadFile(
      "story1",
      "https://example.com/file.jpg",
      "test.jpg",
      undefined,
    );

    assert.strictEqual(downloadMock.mock.callCount(), 1);

    // Simulate first download failing (undefined downloadId)
    mockChrome.runtime.lastError = { message: "Network error" };
    callbacks[0](undefined);

    // Should retry, so call count increases after delay
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.strictEqual(downloadMock.mock.callCount(), 2);

    // Fail second attempt
    callbacks[1](undefined);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.strictEqual(downloadMock.mock.callCount(), 3);

    // Fail third attempt (max retries reached)
    callbacks[2](undefined);

    // Verify error was logged
    assert.ok(
      consoleErrorMock.mock.calls.some((call) =>
        call.arguments[0].includes("Download failed after 3 attempts"),
      ),
    );

    console.error = originalConsoleError;
  });
});
