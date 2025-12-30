import { graphqlListener, sendGraphqlRequest } from "./graphql.js";

/**
 * @typedef {import('./types').Story} Story
 * @typedef {import('./types').StoryPost} StoryPost
 * @typedef {import('./types').StoryVideo} StoryVideo
 * @typedef {import('./types').StoryWatch} StoryWatch
 * @typedef {import('./types').Media} Media
 * @typedef {import('./types').MediaId} MediaId
 * @typedef {import('./types').MediaVideo} MediaVideo
 * @typedef {import('./types').MediaWatch} MediaWatch
 * @typedef {import('./types').MediaPhoto} MediaPhoto
 * @typedef {import('./types').MediaPhotoUrl} MediaPhotoUrl
 * @typedef {import('./types').User} User
 * @typedef {import('./types').Group} Group
 */

const PHOTO_ROOT_QUERY = "CometPhotoRootContentQuery";
const VIDEO_ROOT_QUERY = "CometVideoRootMediaViewerQuery";

/** @type {Map<string, number>} */
const storyCreateTimeCache = new Map();

/** @type {Map<string, Group>} */
const storyGroupCache = new Map();

/** @type {Map<string, string>} */
const videoUrlCache = new Map();

/**
 * Check if an object is a MediaPhoto.
 * @param {unknown} obj
 * @returns {obj is MediaPhoto}
 */
function isMediaPhoto(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.__typename !== "Photo") return false;
  if (typeof o.id !== "string" || !o.id) return false;
  return true;
}

/**
 * Check if an object is a MediaVideo (has videoDeliveryResponseFragment or video_grid_renderer).
 * @param {unknown} obj
 * @returns {obj is MediaVideo}
 */
function isMediaVideo(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.__typename !== "Video") return false;
  // MediaVideo has videoDeliveryResponseFragment or video_grid_renderer
  return "videoDeliveryResponseFragment" in o || "video_grid_renderer" in o;
}

/**
 * Check if an object is a MediaWatch (Video with url but no videoDeliveryResponseFragment).
 * @param {unknown} obj
 * @returns {obj is MediaWatch}
 */
function isMediaWatch(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.__typename !== "Video") return false;
  // MediaWatch has url but no videoDeliveryResponseFragment or video_grid_renderer
  return (
    typeof o.url === "string" &&
    !("videoDeliveryResponseFragment" in o) &&
    !("video_grid_renderer" in o)
  );
}

/**
 * Get the download URL and extension for a media item.
 * @param {Media} media
 * @returns {{ url: string, ext: string } | undefined}
 */
function getDownloadUrl(media) {
  if (isMediaPhoto(media)) {
    // Pick the best image by comparing dimensions (width * height)
    /** @type {MediaPhotoUrl | undefined} */
    let best;
    for (const img of [media.image, media.viewer_image, media.photo_image]) {
      if (!img?.uri) continue;
      const size = img.width * img.height;
      if (!best || size > best.width * best.height) {
        best = img;
      }
    }
    if (!best) return undefined;

    const url = best.uri;
    let ext = "jpg";
    try {
      if (/\.png(\?|$)/i.test(url)) ext = "png";
      else {
        const u = new URL(url);
        const fmt = u.searchParams.get("format");
        if (fmt && /^png$/i.test(fmt)) ext = "png";
      }
    } catch {
      if (/\.png(\?|$)/i.test(url)) ext = "png";
    }
    return { url, ext };
  }

  if (isMediaVideo(media)) {
    const list =
      media?.videoDeliveryResponseFragment?.videoDeliveryResponseResult
        ?.progressive_urls ??
      media?.video_grid_renderer?.video?.videoDeliveryResponseFragment
        ?.videoDeliveryResponseResult?.progressive_urls;

    if (Array.isArray(list) && list.length > 0) {
      const hd = list.find(
        (x) => x?.metadata?.quality === "HD" && x?.progressive_url,
      );
      if (hd?.progressive_url) return { url: hd.progressive_url, ext: "mp4" };

      const first = list.find((x) => x?.progressive_url);
      if (first?.progressive_url)
        return { url: first.progressive_url, ext: "mp4" };
    }
    return undefined;
  }

  if (isMediaWatch(media)) {
    return { url: media.url, ext: "mp4" };
  }

  return undefined;
}

/**
 * Get the number of attachments in a story.
 * @param {Story} story
 * @returns {number}
 */
export function getAttachmentCount(story) {
  if (isStoryPost(story)) {
    const attachment = story.attachments[0]?.styles.attachment;
    if (!attachment) return 0;
    if ("all_subattachments" in attachment)
      return attachment.all_subattachments.count;
    // Check for shorts video (fb_shorts_story with attachments)
    const shortsAttachments = /** @type {any} */ (attachment).style_infos?.[0]
      ?.fb_shorts_story?.attachments;
    if (Array.isArray(shortsAttachments) && shortsAttachments.length > 0)
      return shortsAttachments.length;
    if ("media" in attachment && attachment.media) return 1;
    return 0;
  }
  if (isStoryVideo(story) || isStoryWatch(story)) {
    return 1;
  }
  return 0;
}

/**
 * Get the total number of files to download for a story.
 * This includes attachments + index.md + attached_story attachments (if any).
 * @param {Story} story
 * @returns {number}
 */
export function getDownloadCount(story) {
  let count = getAttachmentCount(story) + 1; // +1 for index.md
  if (isStoryPost(story) && story.attached_story) {
    count += getAttachmentCount(story.attached_story);
  }
  return count;
}

/**
 * Check if an object is a valid MediaId.
 * @param {unknown} obj
 * @returns {obj is MediaId}
 */
function isMediaId(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.__typename !== "Video" && o.__typename !== "Photo") return false;
  if (typeof o.id !== "string" || !o.id) return false;
  return true;
}

/**
 * Fetch navigation info for a media node.
 * @param {MediaId} currentId
 * @param {string} mediasetToken
 * @returns {Promise<{ currMedia: Media | undefined, nextId: MediaId | undefined }>}
 */
async function fetchMediaNav(currentId, mediasetToken) {
  const apiName =
    currentId.__typename === "Video" ? VIDEO_ROOT_QUERY : PHOTO_ROOT_QUERY;
  const objs = await sendGraphqlRequest({
    apiName,
    variables: {
      nodeID: currentId.id,
      mediasetToken,
    },
  });

  /** @type {Media | undefined} */
  let currMedia;
  /** @type {MediaId | undefined} */
  let nextId;

  for (const obj of objs) {
    /** @type {any} */
    const data = obj.data;
    if (isMediaId(data?.nextMediaAfterNodeId)) {
      nextId = data.nextMediaAfterNodeId;
    }
    if (data?.currMedia) {
      currMedia = data.currMedia;
    }
    if (data?.mediaset?.currMedia?.edges?.[0]?.node) {
      currMedia = data.mediaset.currMedia.edges[0].node;
    }
  }

  return { currMedia, nextId };
}

/**
 * Fetch attachments for a story, calling the callback for each attachment as it's retrieved.
 * @param {Story} story
 * @param {(media: Media) => void} onAttachment
 * @returns {Promise<void>}
 */
async function fetchAttachments(story, onAttachment) {
  if (story.attachments.length === 0) return;

  // For StoryPost, walk through the media set
  if (isStoryPost(story)) {
    const totalCount = getAttachmentCount(story);
    let downloadedCount = 0;
    /** @type {MediaId | undefined} */
    let currentId;

    // First, use media directly from the story attachment
    const attachment = story.attachments[0]?.styles?.attachment;
    if (attachment && "all_subattachments" in attachment) {
      // Multiple media - use all_subattachments
      for (const node of attachment.all_subattachments.nodes) {
        if (node?.media) {
          onAttachment(node.media);
          downloadedCount++;
          currentId = node.media;
        }
      }
    } else if (attachment && "media" in attachment && attachment.media) {
      // Single media
      onAttachment(attachment.media);
      downloadedCount++;
      currentId = attachment.media;
    } else {
      // Check for shorts video (fb_shorts_story with attachments)
      const shortsAttachments = /** @type {any} */ (attachment)
        ?.style_infos?.[0]?.fb_shorts_story?.attachments;
      if (Array.isArray(shortsAttachments) && shortsAttachments.length > 0) {
        for (const shortsNode of shortsAttachments) {
          if (shortsNode?.media) {
            onAttachment(shortsNode.media);
            downloadedCount++;
            currentId = shortsNode.media;
          }
        }
      }
    }

    // If we still need more, use media navigation starting from the last downloaded media
    if (downloadedCount < totalCount && currentId) {
      const mediasetToken = `pcb.${story.post_id}`;

      // Get the nextId from the last downloaded media
      let nav = await fetchMediaNav(currentId, mediasetToken);
      currentId = nav.nextId;

      while (currentId && downloadedCount < totalCount) {
        await new Promise((r) => setTimeout(r, 200));
        nav = await fetchMediaNav(currentId, mediasetToken);
        if (!nav.currMedia) break;
        downloadedCount++;
        onAttachment(nav.currMedia);
        currentId = nav.nextId;
      }
    }
  }

  // For StoryVideo, directly use the media from the attachment
  if (isStoryVideo(story)) {
    const media = story.attachments[0].media;
    onAttachment(media);
    return;
  }

  // For StoryWatch, use cached video URL
  if (isStoryWatch(story)) {
    const videoId = story.attachments[0].media.id;
    const videoUrl = videoUrlCache.get(videoId);
    if (videoUrl) {
      /** @type {MediaWatch} */
      const media = {
        __typename: "Video",
        id: videoId,
        url: videoUrl,
      };
      onAttachment(media);
    }
    return;
  }
}

/**
 * Sanitize a string for use in a filename.
 * @param {string} str
 * @returns {string}
 */
function sanitizeFilename(str) {
  return str.replace(/[<>:"/\\|?*]/g, "_").trim();
}

/**
 * Build the folder name for a story download.
 * Format: {date:YYYY-MM-DD}_{groupName}_{actorName}_{post_id}
 * @param {Story} story
 * @returns {string}
 */
function buildFolderName(story) {
  const parts = [];

  // Date part
  const createTime = getCreateTime(story);
  if (createTime) {
    const year = createTime.getFullYear();
    const month = String(createTime.getMonth() + 1).padStart(2, "0");
    const day = String(createTime.getDate()).padStart(2, "0");
    parts.push(`${year}-${month}-${day}`);
  }

  // Group name part
  const group = getGroup(story);
  if (group) {
    parts.push(sanitizeFilename(group.name));
  }

  // Actor name part
  const actor = getStoryActor(story);
  if (actor) {
    parts.push(sanitizeFilename(actor.name));
  }

  // Post ID part (always included)
  parts.push(getStoryPostId(story));

  return parts.join("_");
}

/**
 * Render a story to markdown content.
 * @param {Story} story
 * @param {Array<{ media: Media, filename: string }>} attachments
 * @param {string} [quoted_story] - Pre-rendered quoted story content
 * @returns {string}
 */
function renderStory(story, attachments, quoted_story) {
  const lines = [];

  // URL
  lines.push(`**URL:** ${getStoryUrl(story)}`);
  lines.push("");

  // Group
  const group = getGroup(story);
  if (group) {
    lines.push(`**Group:** ${group.name}`);
    lines.push("");
  }

  // Actor
  const actor = getStoryActor(story);
  if (actor) {
    lines.push(`**Author:** ${actor.name}`);
    lines.push("");
  }

  // Create time
  const createTime = getCreateTime(story);
  if (createTime) {
    lines.push(`**Date:** ${createTime.toISOString()}`);
    lines.push("");
  }

  // Video title (for StoryVideo/StoryWatch with media title)
  const mediaTitle = getStoryMediaTitle(story);
  if (mediaTitle) {
    lines.push("---");
    lines.push("");
    lines.push(`**${mediaTitle}**`);
    lines.push("");
  }

  // Message
  const message = getStoryMessage(story);
  if (message) {
    lines.push("---");
    lines.push("");
    lines.push(message);
    lines.push("");
  }

  // Attachments
  if (attachments.length > 0) {
    lines.push("---");
    lines.push("");
    for (const { media, filename } of attachments) {
      const basename = filename.split("/").pop() || filename;
      if (media.__typename === "Video") {
        lines.push(`- [${basename}](./${basename})`);
      } else {
        lines.push(`![${basename}](./${basename})`);
      }
    }
    lines.push("");
  }

  // Quoted story
  if (quoted_story) {
    lines.push("---");
    lines.push("");
    // Prefix each line with "> " for blockquote
    const quotedLines = quoted_story.split("\n").map((line) => `> ${line}`);
    lines.push(...quotedLines);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Fetch story files for download.
 * @param {Story} story
 * @param {(storyId: string, url: string, filename: string) => void} onDownloadFile
 * @returns {Promise<void>}
 */
export async function fetchStoryFiles(story, onDownloadFile) {
  const folder = buildFolderName(story);
  const storyId = getStoryId(story);

  /** @type {Array<{ media: Media, filename: string }>} */
  const downloadedAttachments = [];
  let mediaIndex = 0;

  await fetchAttachments(story, (media) => {
    const download = getDownloadUrl(media);
    if (!download) return;

    mediaIndex++;
    const indexPrefix = String(mediaIndex).padStart(4, "0");
    const filename = `${folder}/${indexPrefix}_${media.id}.${download.ext}`;
    onDownloadFile(storyId, download.url, filename);
    downloadedAttachments.push({ media, filename });
  });

  // Fetch attachments for attached_story if it exists
  /** @type {string | undefined} */
  let quotedStory;
  if (isStoryPost(story) && story.attached_story) {
    /** @type {Array<{ media: Media, filename: string }>} */
    const attachedStoryAttachments = [];
    await fetchAttachments(story.attached_story, (media) => {
      const download = getDownloadUrl(media);
      if (!download) return;

      mediaIndex++;
      const indexPrefix = String(mediaIndex).padStart(4, "0");
      const filename = `${folder}/${indexPrefix}_${media.id}.${download.ext}`;
      onDownloadFile(storyId, download.url, filename);
      attachedStoryAttachments.push({ media, filename });
    });
    quotedStory = renderStory(story.attached_story, attachedStoryAttachments);
  }

  const indexMarkdown = renderStory(story, downloadedAttachments, quotedStory);
  const indexDataUrl =
    "data:text/markdown;charset=utf-8," + encodeURIComponent(indexMarkdown);
  onDownloadFile(storyId, indexDataUrl, `${folder}/index.md`);
}

/**
 * Get the creation time for a story.
 * @param {Story} story
 * @returns {Date | undefined}
 */
export function getCreateTime(story) {
  // For StoryVideo, get publish_time directly from the media
  if (isStoryVideo(story)) {
    const publishTime = story.attachments[0].media.publish_time;
    return new Date(publishTime * 1000);
  }

  // For StoryPost and StoryWatch, use the cache
  if (isStoryPost(story) || isStoryWatch(story)) {
    const createTime = storyCreateTimeCache.get(getStoryId(story));
    if (createTime === undefined) return undefined;
    return new Date(createTime * 1000);
  }

  return undefined;
}

/**
 * Get the group for a story.
 * @param {Story} story
 * @returns {Group | undefined}
 */
export function getGroup(story) {
  return storyGroupCache.get(getStoryId(story));
}

/**
 * Get the URL for a story.
 * @param {Story} story
 * @returns {string}
 */
export function getStoryUrl(story) {
  if (isStoryPost(story)) {
    return story.wwwURL;
  }
  if (isStoryVideo(story) || isStoryWatch(story)) {
    return `https://www.facebook.com/watch/?v=${story.attachments[0].media.id}`;
  }
  return "";
}

/**
 * Get the message text for a story.
 * @param {Story} story
 * @returns {string | undefined}
 */
export function getStoryMessage(story) {
  if (isStoryPost(story) || isStoryVideo(story)) {
    return story.message?.text;
  }
  if (isStoryWatch(story)) {
    return story.attachments[0].media.creation_story.comet_sections.message
      ?.story?.message?.text;
  }
  return undefined;
}

/**
 * Get the post_id for a story.
 * @param {Story} story
 * @returns {string}
 */
export function getStoryPostId(story) {
  if (isStoryPost(story) || isStoryVideo(story)) {
    return story.post_id;
  }
  if (isStoryWatch(story)) {
    return story.attachments[0].media.id;
  }
  throw new Error("Unknown story type: cannot get post_id");
}

/**
 * Get the id for a story.
 * @param {Story} story
 * @returns {string}
 */
export function getStoryId(story) {
  if (isStoryPost(story) || isStoryVideo(story)) {
    return story.id;
  }
  if (isStoryWatch(story)) {
    return story.attachments[0].media.creation_story.id;
  }
  throw new Error("Unknown story type: cannot get id");
}

/**
 * Get the primary actor for a story.
 * @param {Story} story
 * @returns {User | undefined}
 */
export function getStoryActor(story) {
  if (isStoryPost(story) || isStoryVideo(story)) {
    return story.actors?.[0];
  }
  if (isStoryWatch(story)) {
    return story.attachments[0].media.owner;
  }
  return undefined;
}

/**
 * Get the media title for a story (video name/title).
 * @param {Story} story
 * @returns {string | undefined}
 */
export function getStoryMediaTitle(story) {
  if (isStoryVideo(story)) {
    return story.attachments[0].media.name;
  }
  if (isStoryWatch(story)) {
    return story.attachments[0].media.title?.text;
  }
  return undefined;
}

/**
 * Check if an object is a valid StoryPost.
 * @param {unknown} obj
 * @returns {obj is StoryPost}
 */
export function isStoryPost(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);

  // Must have id, post_id, and wwwURL
  if (typeof o.id !== "string" || !o.id) return false;
  if (typeof o.post_id !== "string" || !o.post_id) return false;
  if (typeof o.wwwURL !== "string" || !o.wwwURL) return false;

  // Must have attachments array
  if (!Array.isArray(o.attachments)) return false;

  return true;
}

/**
 * Check if an object is a valid StoryVideo.
 * @param {unknown} obj
 * @returns {obj is StoryVideo}
 */
function isStoryVideo(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);

  // Must have attachments array with url and media
  if (!Array.isArray(o.attachments)) return false;
  if (o.attachments.length === 0) return false;

  const attachment = /** @type {Record<string, unknown>} */ (o.attachments[0]);
  if (typeof attachment?.url !== "string" || !attachment.url) return false;
  if (!attachment.media || typeof attachment.media !== "object") return false;

  const media = /** @type {Record<string, unknown>} */ (attachment.media);
  if (media.__typename !== "Video") return false;
  if (typeof media.publish_time !== "number") return false;

  return true;
}

/**
 * Check if an object is a valid StoryWatch.
 * @param {unknown} obj
 * @returns {obj is StoryWatch}
 */
function isStoryWatch(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (obj);

  // Must have attachments array
  if (!Array.isArray(o.attachments)) return false;
  if (o.attachments.length === 0) return false;

  const attachment = /** @type {Record<string, unknown>} */ (o.attachments[0]);
  if (!attachment.media || typeof attachment.media !== "object") return false;

  const media = /** @type {Record<string, unknown>} */ (attachment.media);
  if (media.__typename !== "Video") return false;

  // Must have creation_story with comet_sections
  if (!media.creation_story || typeof media.creation_story !== "object")
    return false;
  const creationStory = /** @type {Record<string, unknown>} */ (
    media.creation_story
  );
  if (
    !creationStory.comet_sections ||
    typeof creationStory.comet_sections !== "object"
  )
    return false;

  return true;
}

/**
 * Check if an object is a valid Story (StoryPost, StoryVideo, or StoryWatch).
 * @param {unknown} obj
 * @returns {obj is Story}
 */
function isStory(obj) {
  return isStoryPost(obj) || isStoryVideo(obj) || isStoryWatch(obj);
}

/**
 * Recursively extract stories from deeply nested objects.
 * Stories are identified by having id, post_id, and attachments array.
 * @param {unknown} obj
 * @param {Story[]} [results] - Array to collect stories, deduplicates by post_id
 * @returns {Story[]}
 */
export function extractStories(obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  const o = /** @type {Record<string, unknown>} */ (obj);

  // Check if this object is a valid story
  const objIsStory = isStory(obj);
  if (objIsStory) {
    results.push(obj);
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
      if (objIsStory && key === "attached_story") continue;
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
export function extractStoryCreateTime(obj) {
  if (!obj || typeof obj !== "object") return;

  const o = /** @type {Record<string, unknown>} */ (obj);

  // Check if this object has creation_time, id and url (metadata object)
  if (
    typeof o.creation_time === "number" &&
    typeof o.id === "string" &&
    typeof o.url === "string"
  ) {
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
  if (!obj || typeof obj !== "object") return;

  const o = /** @type {Record<string, unknown>} */ (obj);

  // Check if this object has id (string) and to.__typename === "Group"
  if (typeof o.id === "string" && o.to && typeof o.to === "object") {
    const to = /** @type {Record<string, unknown>} */ (o.to);
    if (
      to.__typename === "Group" &&
      typeof to.id === "string" &&
      typeof to.name === "string"
    ) {
      // Only set if not already present (prefer first/most complete match)
      if (!storyGroupCache.has(o.id)) {
        storyGroupCache.set(o.id, /** @type {Group} */ (to));
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
 * Extract video URLs from all_video_dash_prefetch_representations in extensions field
 * and populate videoUrlCache directly.
 * @param {unknown} obj
 */
export function extractVideoUrls(obj) {
  if (!obj || typeof obj !== "object") return;

  const o = /** @type {Record<string, unknown>} */ (obj);

  // Check if this object has all_video_dash_prefetch_representations
  if (Array.isArray(o.all_video_dash_prefetch_representations)) {
    for (const prefetch of o.all_video_dash_prefetch_representations) {
      if (!prefetch || typeof prefetch !== "object") continue;
      const p = /** @type {Record<string, unknown>} */ (prefetch);
      const videoId = p.video_id;
      if (typeof videoId !== "string") continue;
      if (videoUrlCache.has(videoId)) continue;

      // Find the best video representation (highest bandwidth, excluding audio-only)
      const representations = p.representations;
      if (!Array.isArray(representations)) continue;

      /** @type {{ base_url: string, bandwidth: number } | null} */
      let best = null;
      for (const rep of representations) {
        if (!rep || typeof rep !== "object") continue;
        const r = /** @type {Record<string, unknown>} */ (rep);
        const baseUrl = r.base_url;
        const bandwidth = r.bandwidth;
        const mimeType = r.mime_type;

        // Skip audio-only tracks
        if (typeof mimeType === "string" && mimeType.startsWith("audio/"))
          continue;

        if (typeof baseUrl === "string" && typeof bandwidth === "number") {
          if (!best || bandwidth > best.bandwidth) {
            best = { base_url: baseUrl, bandwidth };
          }
        }
      }

      if (best) {
        videoUrlCache.set(videoId, best.base_url);
      }
    }
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractVideoUrls(item);
    }
  } else {
    for (const key of Object.keys(o)) {
      extractVideoUrls(o[key]);
    }
  }
}

/**
 * Extract stories embedded in the initial HTML page load.
 * These are delivered via <script type="application/json"> tags.
 * @returns {Story[]}
 */
function extractEmbeddedStories() {
  /** @type {Story[]} */
  const stories = [];

  const scripts = document.querySelectorAll('script[type="application/json"]');
  for (const script of scripts) {
    const content = script.textContent;
    if (!content) continue;

    try {
      const data = JSON.parse(content);
      extractStories(data, stories);
      extractStoryCreateTime(data);
      extractStoryGroupMap(data);
      extractVideoUrls(data);
    } catch {
      // ignore parse errors
    }
  }

  return stories;
}

/**
 * Facebook uses different GraphQL operation ("friendly") names depending on context.
 * - CometGroupDiscussionRootSuccessQuery: Group discussion page
 * - CometModernHomeFeedQuery: Home feed
 * - CometNewsFeedPaginationQuery: Home feed pagination
 * - CometVideoHomeFeedRootQuery: Video home feed root (Watch tab)
 * - CometVideoHomeFeedSectionPaginationQuery: Video home feed pagination (Watch tab)
 * - GroupsCometCrossGroupFeedContainerQuery: Cross-group feed (/groups/feed/)
 * - GroupsCometCrossGroupFeedPaginationQuery: Cross-group feed pagination
 * - GroupsCometFeedRegularStoriesPaginationQuery: Group feed
 * - ProfileCometContextualProfileGroupPostsFeedPaginationQuery: Group member profile feed
 * - ProfileCometContextualProfileRootQuery: Contextual profile root
 * - ProfileCometTimelineFeedQuery: User profile timeline
 * - ProfileCometTimelineFeedRefetchQuery: User profile timeline refetch/pagination
 * - SearchCometResultsInitialResultsQuery: Search results
 * - SearchCometResultsPaginatedResultsQuery: Search results pagination
 */
const TARGET_API_NAMES = new Set([
  "CometGroupDiscussionRootSuccessQuery",
  "CometModernHomeFeedQuery",
  "CometNewsFeedPaginationQuery",
  "CometVideoHomeFeedRootQuery",
  "CometVideoHomeFeedSectionPaginationQuery",
  "GroupsCometCrossGroupFeedContainerQuery",
  "GroupsCometCrossGroupFeedPaginationQuery",
  "GroupsCometFeedRegularStoriesPaginationQuery",
  "ProfileCometContextualProfileGroupPostsFeedPaginationQuery",
  "ProfileCometContextualProfileRootQuery",
  "ProfileCometTimelineFeedQuery",
  "ProfileCometTimelineFeedRefetchQuery",
  "SearchCometResultsInitialResultsQuery",
  "SearchCometResultsPaginatedResultsQuery",
]);

/**
 * @param {(story: Story) => void} cb
 * @returns {() => void}
 */
export function storyListener(cb) {
  // Poll for embedded stories every 500ms for 10 seconds
  /** @type {Set<string>} */
  const emittedStoryIds = new Set();

  let elapsed = 0;
  const pollInterval = 500;
  const maxDuration = 10000;

  const intervalId = setInterval(() => {
    elapsed += pollInterval;

    const embeddedStories = extractEmbeddedStories();
    for (const story of embeddedStories) {
      const storyId = getStoryId(story);
      if (emittedStoryIds.has(storyId)) continue;
      emittedStoryIds.add(storyId);
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
    const apiName =
      ev.requestHeaders["x-fb-friendly-name"] ||
      ev.requestPayload["fb_api_req_friendly_name"];
    if (!apiName || !TARGET_API_NAMES.has(apiName)) return;

    const stories = extractStories(ev.responseBody);
    extractStoryCreateTime(ev.responseBody);
    extractStoryGroupMap(ev.responseBody);
    extractVideoUrls(ev.responseBody);

    for (const story of stories) {
      const storyId = getStoryId(story);
      if (emittedStoryIds.has(storyId)) continue;
      emittedStoryIds.add(storyId);
      try {
        cb(story);
      } catch {
        // ignore listener errors
      }
    }
  });
}
