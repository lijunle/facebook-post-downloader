import { graphqlListener, sendGraphqlRequest } from './graphql.js';

const PHOTO_ROOT_QUERY = "CometPhotoRootContentQuery";

/**
 * @param {string} url
 * @returns {string}
 */
function guessExt(url) {
    try {
        if (/\.png(\?|$)/i.test(url)) return "png";
        const u = new URL(url);
        const fmt = u.searchParams.get("format");
        if (fmt && /^png$/i.test(fmt)) return "png";
        return "jpg";
    } catch {
        return /\.png(\?|$)/i.test(url) ? "png" : "jpg";
    }
}

/**
 * @param {import('./types').StoryVideo} media
 * @returns {string | undefined}
 */
function pickBestProgressiveUrl(media) {
    const list = media?.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.progressive_urls;
    if (!Array.isArray(list) || list.length === 0) return undefined;

    const hd = list.find(
        /** @param {any} x */(x) => x?.metadata?.quality === "HD" && typeof x?.progressive_url === "string" && x.progressive_url,
    );
    if (hd && typeof hd.progressive_url === "string") return hd.progressive_url;

    const first = list.find(
        /** @param {any} x */(x) => typeof x?.progressive_url === "string" && x.progressive_url,
    );
    return first ? String(first.progressive_url) : undefined;
}

/**
 * Get the download URL and extension for a media item.
 * @param {import('./types').StoryMedia} media
 * @returns {{ url: string, ext: string } | undefined}
 */
export function getDownloadUrl(media) {
    if (media.__typename === "Video") {
        const url = pickBestProgressiveUrl(media);
        if (!url) return undefined;
        return { url, ext: "mp4" };
    }

    const url = media.image?.uri;
    if (typeof url !== "string" || !url) return undefined;
    return { url, ext: guessExt(url) };
}

/**
 * Get the number of attachments in a story.
 * @param {import('./types').Story} story
 * @returns {number}
 */
export function getAttachmentCount(story) {
    const attachment = story.attachments[0]?.styles.attachment;
    if (!attachment) return 0;
    if ('all_subattachments' in attachment) return attachment.all_subattachments.count;
    return 1;
}

/** @type {WeakMap<import('./types').Story, import('./types').StoryMedia[]>} */
const attachmentsCache = new WeakMap();

/**
 * Extract media navigation info from a CometPhotoRootContentQuery response.
 * @param {Record<string, unknown>} obj
 * @returns {{ currMedia: import('./types').StoryMedia | undefined, nextId: string | undefined, prevId: string | undefined }}
 */
function extractMediaNav(obj) {
    /** @type {any} */
    const data = obj?.data;

    /** @type {import('./types').StoryMedia | undefined} */
    const currMedia = data?.currMedia;
    /** @type {{ id: string } | undefined} */
    const nextNav = data?.nextMediaAfterNodeId;
    /** @type {{ id: string } | undefined} */
    const prevNav = data?.prevMediaBeforeNodeId;

    return {
        currMedia,
        nextId: nextNav?.id,
        prevId: prevNav?.id,
    };
}

/**
 * Fetch navigation info for a media node.
 * @param {string} nodeId
 * @param {string} mediasetToken
 * @returns {Promise<{ currMedia: import('./types').StoryMedia | undefined, nextId: string | undefined, prevId: string | undefined }>}
 */
async function fetchMediaNav(nodeId, mediasetToken) {
    const objs = await sendGraphqlRequest({
        apiName: PHOTO_ROOT_QUERY,
        variables: {
            isMediaset: true,
            nodeID: nodeId,
            mediasetToken,
            scale: 1,
        },
    });

    /** @type {import('./types').StoryMedia | undefined} */
    let currMedia;
    /** @type {string | undefined} */
    let nextId;
    /** @type {string | undefined} */
    let prevId;

    for (const o of objs) {
        const nav = extractMediaNav(o);
        if (nav.currMedia) currMedia = nav.currMedia;
        if (nav.nextId) nextId = nav.nextId;
        if (nav.prevId) prevId = nav.prevId;
    }

    return { currMedia, nextId, prevId };
}

/**
 * Fetch attachments for a story, calling the callback for each attachment as it's retrieved.
 * @param {import('./types').Story} story
 * @param {(media: import('./types').StoryMedia) => void} onAttachment
 * @returns {Promise<void>}
 */
export async function fetchAttachments(story, onAttachment) {
    const cached = attachmentsCache.get(story);
    if (cached) {
        for (const media of cached) {
            onAttachment(media);
        }
        return;
    }

    if (story.attachments.length === 0) return;
    const attachment = story.attachments[0].styles.attachment;
    const seedId = 'media' in attachment
        ? attachment.media.id
        : attachment.all_subattachments.nodes[0]?.media.id;
    if (!seedId) return;

    const mediasetToken = `pcb.${story.post_id}`;
    const totalCount = getAttachmentCount(story);

    // Walk from the seed to collect all media
    /** @type {import('./types').StoryMedia[]} */
    const result = [];
    /** @type {string | undefined} */
    let currentId = seedId;
    while (currentId && result.length < totalCount && !result.some(m => m.id === currentId)) {
        const nav = await fetchMediaNav(currentId, mediasetToken);
        if (!nav.currMedia) break;
        result.push(nav.currMedia);
        onAttachment(nav.currMedia);
        currentId = nav.nextId;
    }

    attachmentsCache.set(story, result);
}

/**
 * Check if an object is a valid Story.
 * @param {unknown} obj
 * @returns {obj is import('./types').Story}
 */
export function isStory(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const o = /** @type {Record<string, unknown>} */ (obj);

    // Must have id and post_id
    if (typeof o.id !== 'string' || !o.id) return false;
    if (typeof o.post_id !== 'string' || !o.post_id) return false;

    // Must have attachments array (can be empty for text-only posts)
    if (!Array.isArray(o.attachments)) return false;

    // If attachments exist, first one must have styles.attachment with media or all_subattachments
    if (o.attachments.length > 0) {
        const firstAttachment = /** @type {Record<string, unknown> | undefined} */ (o.attachments[0]);
        if (!firstAttachment) return false;

        const styles = /** @type {Record<string, unknown> | undefined} */ (firstAttachment.styles);
        if (!styles) return false;

        const attachment = /** @type {Record<string, unknown> | undefined} */ (styles.attachment);
        if (!attachment) return false;

        // Must have either media or all_subattachments
        if (!('media' in attachment) && !('all_subattachments' in attachment)) return false;
    }

    return true;
}

/**
 * Recursively extract stories from deeply nested objects.
 * Stories are identified by having id, post_id, and attachments array.
 * @param {unknown} obj
 * @param {import('./types').Story[]} [results] - Array to collect stories, deduplicates by post_id
 * @returns {import('./types').Story[]}
 */
export function extractStories(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;

    const o = /** @type {Record<string, unknown>} */ (obj);

    // Check if this object is a valid story
    if (isStory(obj)) {
        const story = /** @type {import('./types').Story} */ (obj);
        const postId = story.post_id;
        const existingIndex = results.findIndex(s => s.post_id === postId);

        // Prefer story with wwwURL (the nested one has more complete data)
        if (existingIndex === -1) {
            results.push(story);
        } else if (story.wwwURL && !results[existingIndex].wwwURL) {
            results[existingIndex] = story;
        }
        // Continue recursing - there might be better nested stories
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractStories(item, results);
        }
    } else {
        const keys = Object.keys(o);
        for (const key of keys) {
            extractStories(o[key], results);
        }
    }

    return results;
}

/**
 * Extract stories embedded in the initial HTML page load.
 * These are delivered via <script type="application/json"> tags.
 * @returns {import('./types').Story[]}
 */
function extractEmbeddedStories() {
    /** @type {import('./types').Story[]} */
    const stories = [];

    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
        const content = script.textContent;
        if (!content) continue;

        // Quick check to avoid parsing irrelevant scripts
        // Look for story-related content
        if (!content.includes('"post_id"') || !content.includes('"attachments"')) continue;

        try {
            const data = JSON.parse(content);
            extractStories(data, stories);
        } catch {
            // ignore parse errors
        }
    }

    return stories;
}

// Facebook uses different GraphQL operation ("friendly") names depending on context.
// - Home feed: CometNewsFeedPaginationQuery
// - Group feed: GroupsCometFeedRegularStoriesPaginationQuery
const TARGET_API_NAMES = new Set([
    "CometNewsFeedPaginationQuery",
    "GroupsCometFeedRegularStoriesPaginationQuery",
]);

/**
 * @param {(story: import('./types').Story) => void} cb
 * @returns {() => void}
 */
export function storyListener(cb) {
    // Poll for embedded stories every 500ms for 5 seconds
    /** @type {Set<string>} */
    const emittedPostIds = new Set();
    let elapsed = 0;
    const pollInterval = 500;
    const maxDuration = 5000;

    const intervalId = setInterval(() => {
        elapsed += pollInterval;

        const embeddedStories = extractEmbeddedStories();
        for (const story of embeddedStories) {
            if (emittedPostIds.has(story.post_id)) continue;
            emittedPostIds.add(story.post_id);
            try {
                cb(story);
            } catch {
                // ignore listener errors
            }
        }

        if (elapsed >= maxDuration) {
            clearInterval(intervalId);
        }
    }, pollInterval);

    // Then listen for new stories from GraphQL responses
    return graphqlListener((ev) => {
        const apiName = ev.requestHeaders["x-fb-friendly-name"] || ev.requestPayload["fb_api_req_friendly_name"];
        if (!apiName || !TARGET_API_NAMES.has(apiName)) return;

        const stories = extractStories(ev.responseBody);
        for (const story of stories) {
            try {
                cb(story);
            } catch {
                // ignore listener errors
            }
        }
    });
}
