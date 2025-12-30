(function () {
  /**
   * Sends a message to the background script.
   * @param {import("./types").AppMessage} message
   */
  function sendChromeMessage(message) {
    chrome.runtime.sendMessage(message);
  }

  /**
   * @param {unknown} value
   * @returns {value is (import("./types").AppMessage & { __fpdl: true })}
   */
  function isAppMessage(value) {
    if (!value || typeof value !== "object") return false;
    const obj = /** @type {Record<string, unknown>} */ (value);
    return obj.__fpdl === true;
  }

  /**
   * Injects app.js into the page context.
   * @returns {void}
   */
  function injectAppScript() {
    const markerId = "fpdl-app-script";
    if (document.getElementById(markerId)) return;

    const script = document.createElement("script");
    script.id = markerId;
    script.type = "module";

    try {
      script.src = chrome.runtime.getURL("extensions/app.js");
      script.onload = () => {
        script.remove();
      };
      script.onerror = (e) => {
        console.warn("[fpdl] Failed to load app.js via script.src", e);
      };
      document.documentElement.appendChild(script);
    } catch (err) {
      console.warn("[fpdl] Failed to inject app.js", err);
    }
  }

  injectAppScript();

  // Forward messages from background to page context
  chrome.runtime.onMessage.addListener(
    (/** @type {import("./types").ChromeMessage} */ message) => {
      if (message.type === "FPDL_TOGGLE") {
        window.postMessage(
          { __fpdl: true, type: "FPDL_TOGGLE" },
          window.location.origin,
        );
      } else if (message.type === "FPDL_DOWNLOAD_RESULT") {
        window.postMessage(
          {
            __fpdl: true,
            type: "FPDL_DOWNLOAD_RESULT",
            storyId: message.storyId,
            url: message.url,
            filename: message.filename,
            status: message.status,
          },
          window.location.origin,
        );
      }
    },
  );

  // Bridge download requests from page-world UI to the extension background.
  window.addEventListener("message", (event) => {
    try {
      if (event.source !== window) return;

      const data = event.data;
      if (!isAppMessage(data)) return;

      if (data.type === "FPDL_STORY_COUNT" && typeof data.count === "number") {
        sendChromeMessage({ type: "FPDL_STORY_COUNT", count: data.count });
      } else if (
        data.type === "FPDL_DOWNLOAD" &&
        typeof data.storyId === "string" &&
        typeof data.url === "string" &&
        typeof data.filename === "string"
      ) {
        sendChromeMessage({
          type: "FPDL_DOWNLOAD",
          storyId: data.storyId,
          url: data.url,
          filename: data.filename,
        });
      } else if (
        data.type === "FPDL_TRACK_EVENT" &&
        typeof data.name === "string"
      ) {
        sendChromeMessage({
          type: "FPDL_TRACK_EVENT",
          name: data.name,
          properties: data.properties,
        });
      }
    } catch (err) {
      console.warn("[fpdl] download bridge failed", err);
    }
  });
})();
