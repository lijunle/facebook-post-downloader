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
    if ('media' in attachment) return 1;
    return attachment.all_subattachments.count;
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
 * Type guard to check if an object is a valid Story.
 * @param {unknown} obj
 * @returns {obj is import('./types').Story}
 */
function isStory(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const story = /** @type {Record<string, unknown>} */ (obj);
    if (typeof story.id !== 'string' || !story.id) return false;
    if (typeof story.post_id !== 'string' || !story.post_id) return false;
    const message = /** @type {Record<string, unknown> | null | undefined} */ (story.message);
    if (!message || typeof message !== 'object') return false;
    if (typeof message.text !== 'string') return false;
    return true;
}

/**
 * Extract story objects from both stream patches and full query payloads.
 * @param {Record<string, unknown>} obj
 * @returns {import('./types').Story[]}
 */
function extractStories(obj) {
    /** @type {import('./types').Story[]} */
    const stories = [];

    /** @type {any} */
    const data = obj?.data;

    // Stream patch shape.
    const patchStory = data?.node?.comet_sections?.content?.story;
    if (isStory(patchStory)) stories.push(patchStory);

    // Full query shape.
    const edges = data?.viewer?.news_feed?.edges;
    if (Array.isArray(edges)) {
        for (const edge of edges) {
            const edgeStory = edge?.node?.comet_sections?.content?.story;
            if (isStory(edgeStory)) stories.push(edgeStory);
        }
    }

    // Group feed query shape.
    const groupFeedEdges = data?.node?.group_feed?.edges;
    if (Array.isArray(groupFeedEdges)) {
        for (const edge of groupFeedEdges) {
            const edgeStory = edge?.node?.comet_sections?.content?.story;
            if (isStory(edgeStory)) stories.push(edgeStory);
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
    return graphqlListener((ev) => {
        const apiName = ev.requestHeaders["x-fb-friendly-name"] || ev.requestPayload["fb_api_req_friendly_name"];
        if (!apiName || !TARGET_API_NAMES.has(apiName)) return;

        for (const entry of ev.responseBody) {
            for (const story of extractStories(entry)) {
                try {
                    cb(story);
                } catch {
                    // ignore listener errors
                }
            }
        }
    });
}
