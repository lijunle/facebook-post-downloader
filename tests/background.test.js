import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

// Mock chrome API before importing the module
const downloadMock = mock.fn();
/** @type {Function[]} */
const onMessageListeners = [];
const mockChrome = {
  downloads: {
    download: downloadMock,
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

const { queueDownload, resetQueue } =
  await import("../extensions/background.js");

describe("queueDownload", () => {
  beforeEach(() => {
    downloadMock.mock.resetCalls();
    mockChrome.runtime.lastError = null;
    resetQueue();
  });

  it("should queue a download message and start download", () => {
    // Simulate successful download
    downloadMock.mock.mockImplementation((options, callback) => {
      callback(12345); // downloadId
    });

    queueDownload(
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

  it("should limit concurrent downloads to MAX_CONCURRENT_DOWNLOADS", () => {
    // Never call the callback to keep downloads "in progress"
    downloadMock.mock.mockImplementation(() => {});

    // Queue 7 downloads
    for (let i = 0; i < 7; i++) {
      queueDownload(
        `story${i}`,
        `https://example.com/file${i}.jpg`,
        `test${i}.jpg`,
        undefined,
      );
    }

    // Only 5 should have started (MAX_CONCURRENT_DOWNLOADS = 5)
    assert.strictEqual(downloadMock.mock.callCount(), 5);
  });

  it("should process queued downloads when a download completes", () => {
    /** @type {((downloadId: number) => void)[]} */
    const callbacks = [];
    downloadMock.mock.mockImplementation((options, callback) => {
      callbacks.push(callback);
    });

    // Queue 7 downloads
    for (let i = 0; i < 7; i++) {
      queueDownload(
        `story${i}`,
        `https://example.com/file${i}.jpg`,
        `test${i}.jpg`,
        undefined,
      );
    }

    // Initially 5 downloads started
    assert.strictEqual(downloadMock.mock.callCount(), 5);

    // Complete the first download
    callbacks[0](12345);

    // Now 6 downloads should have been initiated
    assert.strictEqual(downloadMock.mock.callCount(), 6);

    // Complete another download
    callbacks[1](12346);

    // Now all 7 downloads should have been initiated
    assert.strictEqual(downloadMock.mock.callCount(), 7);
  });

  it("should retry download on failure and process queue after max retries", async () => {
    const consoleErrorMock = mock.fn();
    const originalConsoleError = console.error;
    console.error = consoleErrorMock;

    /** @type {((downloadId: number | undefined) => void)[]} */
    const callbacks = [];
    downloadMock.mock.mockImplementation((options, callback) => {
      callbacks.push(callback);
    });

    // Queue 6 downloads (5 will start immediately, 1 will be queued)
    for (let i = 0; i < 6; i++) {
      queueDownload(
        `story${i}`,
        `https://example.com/file${i}.jpg`,
        `test${i}.jpg`,
        undefined,
      );
    }

    assert.strictEqual(downloadMock.mock.callCount(), 5);

    // Simulate first download failing (undefined downloadId)
    mockChrome.runtime.lastError = { message: "Network error" };
    callbacks[0](undefined);

    // Should retry, so call count increases
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.strictEqual(downloadMock.mock.callCount(), 6);

    // Fail second attempt
    callbacks[5](undefined);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.strictEqual(downloadMock.mock.callCount(), 7);

    // Fail third attempt (max retries reached)
    callbacks[6](undefined);

    // After max retries, queue should process next item
    assert.strictEqual(downloadMock.mock.callCount(), 8);

    // Verify error was logged
    assert.ok(
      consoleErrorMock.mock.calls.some((call) =>
        call.arguments[0].includes("Download failed after 3 attempts"),
      ),
    );

    console.error = originalConsoleError;
  });
});
