# Facebook Post Downloader - Vibe Coding Instructions

Welcome to the codebase. This is a **Chrome Extension (Manifest V3)** designed to scrape and download high-quality media from Facebook posts.

## ⚡ Core Philosophy

- **No Build Step**: We run raw JavaScript (ES Modules) directly in the browser. No Webpack, no Vite, no complex bundling.
- **JSDoc over TypeScript**: We use standard `.js` files with JSDoc comments for type safety. Run `npm run check` to validate types.
- **Injection over Content Scripts**: Most logic lives in `extensions/app.js` which is injected into the _Main World_ (the page's context), not the isolated Content Script world. This allows us to interact with Facebook's internal React state and network events.

## 🏗 Architecture

### 1. The Injection Chain

`manifest.json` -> `content-script.js` -> `app.js`

- **`content-script.js`**: Minimal bridge. It injects `app.js` into the DOM and proxies messages between the Background Worker and the App Script.
- **`app.js`**: The brain. It runs inside the Facebook page. It:
  - Hooks into network requests (via `graphql.js`) to sniff for post data.
  - Injects UI components (Download Buttons) into the DOM.
  - Uses `react.js` to load React/ReactDOM from UMD (no JSX, raw `React.createElement` or wrappers).

### 2. The Background Worker

- **`background.js`**: Handles the actual file downloading (`chrome.downloads` API) and updates the extension icon. It's the only piece that can access privileged Chrome APIs.

### 3. Data Extraction (`story.js` & `graphql.js`)

Facebook's DOM is obfuscated. We don't scrape HTML. We scrape **Data**.

- **`graphql.js`**: Listens for GraphQL responses.
- **`story.js`**: Parses these massive JSON blobs into clean `Story` objects containing high-res video/image URLs.

## 📂 Key Files

| File                       | Purpose                                                                                                      |
| :------------------------- | :----------------------------------------------------------------------------------------------------------- |
| `extensions/app.js`        | Main entry point injected into the page. Orchestrates UI and listeners.                                      |
| `extensions/story.js`      | **The "Business Logic".** Parsers for FB's complex JSON structure.                                           |
| `extensions/graphql.js`    | Network interceptor/listener for FB's GraphQL traffic.                                                       |
| `extensions/background.js` | Service worker. Manages downloads and extension state.                                                       |
| `extensions/react.js`      | Loads React UMD from `node_modules` dynamically.                                                             |
| `bin/find-entry.js`        | **Debug Tool.** CLI script to search HAR files for specific JSON payloads. Useful when FB changes their API. |

## 🛠 Development Workflow

1.  **Setup**: `npm install`
2.  **Format**: `npm run format` (Formats all files with Prettier)
3.  **Format Check**: `npm run format:check` (Validates formatting, used in CI)
4.  **Type Check**: `npm run check` (Essential before committing)
5.  **Test**: `npm test` (Runs `node:test` suite in `tests/`)
6.  **Load in Browser**:
    - Go to `chrome://extensions`
    - "Load unpacked" -> Select this folder.

## 🧠 "Vibe" Guidelines

- **Keep it Raw**: Don't add a bundler unless absolutely necessary.
- **Respect the DOM**: FB is a React app. When injecting buttons, try to be minimally invasive.
- **Reverse Engineering**: If a download breaks, it's likely FB changed a GraphQL query name or structure.
  1.  Save a HAR file from the Network tab.
  2.  Use `bin/find-entry.js` to locate the new structure.
  3.  Update `extensions/story.js`.

## 🧪 Testing

We use Node.js native test runner.

- Tests are in `tests/`.
- We mock `chrome` globals and DOM APIs where needed.
- `tests/*.json` files are captured FB API responses used for regression testing.
