/** @type {Set<(ev: import('./types').GraphqlEvent) => void>} */
const listeners = new Set();

/**
 * @param {(ev: import('./types').GraphqlEvent) => void} cb
 * @returns {() => void}
 */
export function graphqlListener(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

/**
 * @param {import('./types').GraphqlEvent} ev
 */
function emit(ev) {
    for (const cb of listeners) {
        try {
            cb(ev);
        } catch {
            // ignore listener errors
        }
    }
}

// Use the current page origin so redirects (facebook.com -> www.facebook.com)
// and alternate hosts (web.facebook.com, m.facebook.com) still match.
const GRAPHQL_URL = `${location.origin}/api/graphql/`;

// Best-effort GraphQL request context captured from real page traffic.
// Used to replay the same operation later.
/** @type {Record<string, string>} */
let lastParams = {};
/** @type {string} */
let lastLsd = "";
/** @type {Record<string, { docId: string; variables: Record<string, unknown> | null }>} */
const operations = {};

/**
 * Capture base request params and operation doc_id from any GraphQL request.
 * @param {Record<string, string>} headers
 * @param {string | undefined} bodyText
 */
function captureGraphqlContext(headers, bodyText) {
    if (!bodyText) return;
    const params = new URLSearchParams(bodyText);

    const lsd = params.get("lsd") || headers["x-fb-lsd"];
    if (lsd) lastLsd = lsd;

    const apiName = params.get("fb_api_req_friendly_name") || headers["x-fb-friendly-name"];
    const docId = params.get("doc_id");
    if (apiName && docId) {
        const variablesStr = params.get("variables");
        /** @type {Record<string, unknown> | null} */
        let variables = null;
        if (variablesStr) {
            try {
                variables = JSON.parse(variablesStr);
            } catch {
                // ignore parse errors
            }
        }
        operations[apiName] = { docId, variables };
    }

    /** @type {Record<string, string>} */
    const capturedParams = {};
    for (const [k, v] of params.entries()) {
        if (k === "variables" || k === "doc_id" || k === "fb_api_req_friendly_name") continue;
        capturedParams[k] = v;
    }
    lastParams = capturedParams;
}

/** @type {WeakMap<XMLHttpRequest, string>} */
const xhrUrl = new WeakMap();
/** @type {WeakMap<XMLHttpRequest, boolean>} */
const xhrIsTarget = new WeakMap();
/** @type {WeakMap<XMLHttpRequest, Record<string, string>>} */
const xhrHeaders = new WeakMap();
/** @type {WeakMap<XMLHttpRequest, Record<string, string>>} */
const xhrPayload = new WeakMap();

/**
 * Parse NDJSON response text into array of objects.
 * @param {string} text
 * @returns {Record<string, unknown>[]}
 */
function parseNdjson(text) {
    // Strip common anti-JSON prefixes.
    if (text.startsWith("for (;;);")) text = text.slice("for (;;);".length);
    if (text.startsWith(")]}'")) {
        const firstNewline = text.indexOf("\n");
        text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
    }

    /** @type {Record<string, unknown>[]} */
    const result = [];
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            result.push(JSON.parse(trimmed));
        } catch {
            // skip invalid JSON lines
        }
    }
    return result;
}

const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
const originalXhrSend = XMLHttpRequest.prototype.send;

/**
 * @param {string} method
 * @param {string | URL} url
 * @param {boolean} [async]
 * @param {string | null} [username]
 * @param {string | null} [password]
 */
XMLHttpRequest.prototype.open = function patchedOpen(method, url, async = true, username, password) {
    const u = typeof url === "string" ? url : url.href;
    if (method.toUpperCase() === "POST" && u.includes("/api/graphql")) {
        xhrUrl.set(this, u);
        xhrIsTarget.set(this, true);
        xhrHeaders.set(this, {});

        this.addEventListener("load", () => {
            if (!xhrIsTarget.get(this)) return;
            if (typeof this.responseText !== "string") return;

            /** @type {Record<string, string>} */
            const responseHeaders = {};
            for (const line of this.getAllResponseHeaders().trim().split(/\r?\n/)) {
                const idx = line.indexOf(":");
                if (idx > 0) {
                    responseHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
                }
            }

            emit({
                url: xhrUrl.get(this) || "",
                requestHeaders: xhrHeaders.get(this) || {},
                responseHeaders,
                requestPayload: xhrPayload.get(this) || {},
                responseBody: parseNdjson(this.responseText),
                status: this.status,
            });
        });
    }

    return originalXhrOpen.call(this, method, url, async, username, password);
};

/**
 * @param {string} name
 * @param {string} value
 */
XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name, value) {
    const headers = xhrHeaders.get(this);
    if (headers) {
        headers[name.toLowerCase()] = value;
    }
    return originalXhrSetRequestHeader.call(this, name, value);
};

/**
 * @param {Document | XMLHttpRequestBodyInit | null} body
 */
XMLHttpRequest.prototype.send = function patchedSend(body) {
    if (xhrIsTarget.get(this)) {
        /** @type {string | undefined} */
        let bodyText;
        if (typeof body === "string") {
            bodyText = body;
        } else if (body instanceof URLSearchParams) {
            bodyText = body.toString();
        } else if (body instanceof FormData) {
            const parts = [];
            for (const [k, v] of body.entries()) {
                parts.push(`${encodeURIComponent(String(k))}=${encodeURIComponent(String(v))}`);
            }
            bodyText = parts.join("&");
        }

        if (bodyText) {
            const params = new URLSearchParams(bodyText);
            /** @type {Record<string, string>} */
            const payload = {};
            for (const [k, v] of params.entries()) {
                payload[k] = v;
            }
            xhrPayload.set(this, payload);
            captureGraphqlContext(xhrHeaders.get(this) || {}, bodyText);
        }
    }
    return originalXhrSend.call(this, body);
};

/**
 * Replay a GraphQL call using captured base params.
 * @param {{ apiName: string, variables: Record<string, unknown> }} input
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function sendGraphqlRequest(input) {
    const op = operations[input.apiName];
    if (!op) throw new Error(`Operation not found: ${input.apiName}`);

    const variables = { ...(op.variables || {}), ...input.variables };

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(lastParams)) params.set(k, v);
    params.set("fb_api_req_friendly_name", input.apiName);
    params.set("doc_id", op.docId);
    params.set("server_timestamps", "true");
    params.set("variables", JSON.stringify(variables));

    /** @type {Record<string, string>} */
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    if (lastLsd) headers["x-fb-lsd"] = lastLsd;
    headers["x-fb-friendly-name"] = input.apiName;

    const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        credentials: "include",
        headers,
        body: params.toString(),
    });

    const text = await res.text();
    return parseNdjson(text);
}
