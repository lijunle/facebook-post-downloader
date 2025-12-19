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

/** @type {Map<string, number>} */
const storyCreateTimeCache = new Map();

/** @type {Map<string, import('./types').StoryGroup>} */
const storyGroupCache = new Map();

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
    /** @type {string | undefined} */
    let seedId;
    if ('media' in attachment) {
        seedId = attachment.media.id;
    } else if ('all_subattachments' in attachment) {
        seedId = attachment.all_subattachments.nodes[0]?.media.id;
    }
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
 * Download all attachments for a story.
 * @param {import('./types').Story} story
 * @param {(url: string, filename: string) => void} postAppMessage
 * @returns {Promise<void>}
 */
export async function downloadStory(story, postAppMessage) {
    await fetchAttachments(story, (media) => {
        const download = getDownloadUrl(media);
        if (!download) return;

        const filename = `${story.post_id}/${media.id}.${download.ext}`;
        postAppMessage(download.url, filename);
    });
}

/**
 * Get the creation time for a story.
 * @param {import('./types').Story} story
 * @returns {Date | undefined}
 */
export function getCreateTime(story) {
    const createTime = storyCreateTimeCache.get(story.id);
    if (createTime === undefined) return undefined;
    return new Date(createTime * 1000);
}

/**
 * Get the group for a story.
 * @param {import('./types').Story} story
 * @returns {import('./types').StoryGroup | undefined}
 */
export function getGroup(story) {
    return storyGroupCache.get(story.id);
}

/**
 * Check if an object is a valid Story.
 * @param {unknown} obj
 * @returns {obj is import('./types').Story}
 */
export function isStory(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const o = /** @type {Record<string, unknown>} */ (obj);

    // Must have id, post_id, and wwwURL
    if (typeof o.id !== 'string' || !o.id) return false;
    if (typeof o.post_id !== 'string' || !o.post_id) return false;
    if (typeof o.wwwURL !== 'string' || !o.wwwURL) return false;

    // Must have attachments array
    if (!Array.isArray(o.attachments)) return false;

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
    const objIsStory = isStory(obj);
    if (objIsStory) {
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
            // Skip attached_story for story objects - it should remain nested, not extracted separately
            if (objIsStory && key === 'attached_story') continue;
            extractStories(o[key], results);
        }
    }

    return results;
}

/**
 * Recursively extract metadata (creation_time, url) from deeply nested objects
 * and populate storyCreateTimeCache directly.
 * @param {unknown} obj
 */
function extractStoryCreateTime(obj) {
    if (!obj || typeof obj !== 'object') return;

    const o = /** @type {Record<string, unknown>} */ (obj);

    // Check if this object has creation_time, id and url (metadata object)
    if (typeof o.creation_time === 'number' && typeof o.id === 'string' && typeof o.url === 'string') {
        storyCreateTimeCache.set(o.id, o.creation_time);
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractStoryCreateTime(item);
        }
    } else {
        for (const key of Object.keys(o)) {
            extractStoryCreateTime(o[key]);
        }
    }
}

/**
 * Recursively extract group info from deeply nested objects
 * and populate storyGroupCache directly.
 * @param {unknown} obj
 */
export function extractStoryGroupMap(obj) {
    if (!obj || typeof obj !== 'object') return;

    const o = /** @type {Record<string, unknown>} */ (obj);

    // Check if this object has id (string) and to.__typename === "Group"
    if (typeof o.id === 'string' && o.to && typeof o.to === 'object') {
        const to = /** @type {Record<string, unknown>} */ (o.to);
        if (to.__typename === 'Group' && typeof to.id === 'string' && typeof to.name === 'string') {
            // Only set if not already present (prefer first/most complete match)
            if (!storyGroupCache.has(o.id)) {
                storyGroupCache.set(o.id, /** @type {import('./types').StoryGroup} */(to));
            }
        }
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractStoryGroupMap(item);
        }
    } else {
        for (const key of Object.keys(o)) {
            extractStoryGroupMap(o[key]);
        }
    }
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
            extractStoryCreateTime(data);
            extractStoryGroupMap(data);
        } catch {
            // ignore parse errors
        }
    }

    return stories;
}

// Facebook uses different GraphQL operation ("friendly") names depending on context.
// - Home feed: CometModernHomeFeedQuery, CometNewsFeedPaginationQuery
// - Group feed: GroupsCometFeedRegularStoriesPaginationQuery
// - Cross-group feed (/groups/feed/): GroupsCometCrossGroupFeedPaginationQuery
const TARGET_API_NAMES = new Set([
    "CometModernHomeFeedQuery",
    "CometNewsFeedPaginationQuery",
    "GroupsCometFeedRegularStoriesPaginationQuery",
    "GroupsCometCrossGroupFeedPaginationQuery",
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
        extractStoryCreateTime(ev.responseBody);
        extractStoryGroupMap(ev.responseBody);

        for (const story of stories) {
            try {
                cb(story);
            } catch {
                // ignore listener errors
            }
        }
    });
}
