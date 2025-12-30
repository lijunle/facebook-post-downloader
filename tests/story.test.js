import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * @typedef {import('../extensions/types').StoryPost} StoryPost
 * @typedef {import('../extensions/types').StoryVideo} StoryVideo
 * @typedef {import('../extensions/types').Story} Story
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {(params: { apiName: string, variables: Record<string, unknown> }) => Promise<unknown[]>} */
let mockSendGraphqlRequestImpl = async () => [];

// Mock graphql.js before importing story.js
mock.module("../extensions/graphql.js", {
  namedExports: {
    getLocation: () => ({
      host: "www.facebook.com",
      pathname: "/test",
    }),
    graphqlListener: () => {},
    sendGraphqlRequest: /** @type {typeof mockSendGraphqlRequestImpl} */ (
      params,
    ) => mockSendGraphqlRequestImpl(params),
  },
});

const {
  extractStories,
  extractStoryGroupMap,
  getGroup,
  extractStoryCreateTime,
  getCreateTime,
  getAttachmentCount,
  getDownloadCount,
  fetchStoryFiles,
  getStoryUrl,
  getStoryPostId,
  getStoryActor,
  getStoryMessage,
  extractVideoUrls,
  getStoryMediaTitle,
} = await import("../extensions/story.js");

describe("extractStories", () => {
  it("should extract text-only StoryPost from story-text-only.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );
    const result = extractStories(mockData);

    assert.ok(result.length > 0, "Should extract at least one story");

    const textOnlyStory = result.find(
      (s) => getStoryPostId(s) === "1411731986983785",
    );
    assert.ok(textOnlyStory, "Should find the text-only story");
    assert.strictEqual(
      getAttachmentCount(textOnlyStory),
      0,
      "Text-only story should have 0 attachments",
    );
    assert.strictEqual(
      getStoryActor(textOnlyStory)?.name,
      "蔡正元",
      "Actor name should be 蔡正元",
    );
  });

  it("should extract StoryPost with photo attachments from story-attachment-photo.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attachment-photo.json"), "utf8"),
    );
    const result = extractStories(mockData);

    assert.ok(result.length > 0, "Should extract at least one story");

    const storyWithAttachments = result.find(
      (s) => getStoryPostId(s) === "25550089621287122",
    );
    assert.ok(storyWithAttachments, "Should find the story with attachments");
    assert.strictEqual(
      getAttachmentCount(storyWithAttachments),
      4,
      "Story should have 4 attachments",
    );
    assert.strictEqual(
      getStoryActor(storyWithAttachments)?.name,
      "Kimi Cui",
      "Actor name should be Kimi Cui",
    );
  });

  it("should extract StoryPost with attached story from story-attached-story.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story.json"), "utf8"),
    );
    const result = extractStories(mockData);

    assert.strictEqual(result.length, 1, "Should extract exactly 1 story");

    const mainStory = /** @type {StoryPost} */ (
      result.find((s) => getStoryPostId(s) === "1414037856753198")
    );
    assert.ok(mainStory, "Main story should be extracted");
    assert.strictEqual(
      getAttachmentCount(mainStory),
      0,
      "Main story should have 0 attachments",
    );
    assert.strictEqual(
      getStoryActor(mainStory)?.name,
      "蔡正元",
      "Main story actor name should be 蔡正元",
    );

    assert.ok(
      mainStory.attached_story,
      "Main story should have attached_story",
    );
    assert.strictEqual(
      getStoryPostId(mainStory.attached_story),
      "1284281217061999",
      "Attached story should have correct post_id",
    );
    assert.strictEqual(
      getAttachmentCount(mainStory.attached_story),
      1,
      "Attached story should have 1 attachment",
    );
    assert.strictEqual(
      getStoryActor(mainStory.attached_story)?.name,
      "徐勝凌",
      "Attached story actor name should be 徐勝凌",
    );
  });

  it("should extract StoryPost with attached story only from story-attached-story-only.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story-only.json"), "utf8"),
    );
    const result = extractStories(mockData);

    assert.strictEqual(result.length, 1, "Should extract exactly 1 story");

    const mainStory = /** @type {StoryPost} */ (
      result.find((s) => getStoryPostId(s) === "2280345139142267")
    );
    assert.ok(mainStory, "Main story should be extracted");

    assert.ok(
      !getStoryMessage(mainStory),
      "Outer story should have no message",
    );
    assert.strictEqual(
      getAttachmentCount(mainStory),
      0,
      "Outer story should have 0 attachments",
    );
    assert.strictEqual(
      getStoryActor(mainStory)?.name,
      "Carol TianTian",
      "Outer story actor name should be Carol TianTian",
    );

    assert.ok(
      mainStory.attached_story,
      "Main story should have attached_story",
    );
    assert.strictEqual(
      getStoryPostId(mainStory.attached_story),
      "1422788562752398",
      "Attached story should have correct post_id",
    );

    assert.ok(
      getStoryMessage(mainStory.attached_story),
      "Attached story should have message",
    );
    assert.strictEqual(
      getAttachmentCount(mainStory.attached_story),
      1,
      "Attached story should have 1 attachment",
    );
    assert.strictEqual(
      getStoryActor(mainStory.attached_story)?.name,
      "Anime Feels",
      "Attached story actor name should be Anime Feels",
    );
  });

  it("should deduplicate stories and prefer ones with wwwURL", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const postIds = result.map((s) => getStoryPostId(s));
    const uniquePostIds = [...new Set(postIds)];
    assert.strictEqual(
      postIds.length,
      uniquePostIds.length,
      "All post_ids should be unique",
    );

    const storyWithUrl = /** @type {StoryPost | undefined} */ (
      result.find((s) => getStoryPostId(s) === "1411731986983785")
    );
    if (storyWithUrl) {
      assert.ok(storyWithUrl.wwwURL, "Should prefer story with wwwURL");
    }
  });
});

describe("getDownloadCount", () => {
  it("should return 1 for text-only story (index.md only)", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const textOnlyStory = result.find(
      (s) => getStoryPostId(s) === "1411731986983785",
    );
    assert.ok(textOnlyStory, "Should find the text-only story");
    assert.strictEqual(
      getDownloadCount(textOnlyStory),
      1,
      "Text-only story should have download count of 1 (index.md only)",
    );
  });

  it("should return attachments + 1 for story with photo attachments", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attachment-photo.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const storyWithAttachments = result.find(
      (s) => getStoryPostId(s) === "25550089621287122",
    );
    assert.ok(storyWithAttachments, "Should find the story with attachments");
    assert.strictEqual(
      getDownloadCount(storyWithAttachments),
      5,
      "Story with 4 attachments should have download count of 5 (4 photos + index.md)",
    );
  });

  it("should include attached_story attachments in count", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const mainStory = /** @type {StoryPost} */ (
      result.find((s) => getStoryPostId(s) === "1414037856753198")
    );
    assert.ok(mainStory, "Should find the main story");
    assert.ok(
      mainStory.attached_story,
      "Main story should have attached_story",
    );
    // 0 attachments + 1 index.md + 1 attached_story attachment = 2
    assert.strictEqual(
      getDownloadCount(mainStory),
      2,
      "Story with attached_story should include attached_story attachments in count",
    );
  });

  it("should include attached_story attachments for story-attached-story-only", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story-only.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const mainStory = /** @type {StoryPost} */ (
      result.find((s) => getStoryPostId(s) === "2280345139142267")
    );
    assert.ok(mainStory, "Should find the main story");
    // 0 attachments + 1 index.md + 1 attached_story attachment = 2
    assert.strictEqual(
      getDownloadCount(mainStory),
      2,
      "Story with only attached_story should have download count of 2",
    );
  });

  it("should return 2 for StoryVideo (1 video + index.md)", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const storyVideo = result.find(
      (s) => getStoryPostId(s) === "1140140214990654",
    );
    assert.ok(storyVideo, "Should find the StoryVideo");
    assert.strictEqual(
      getDownloadCount(storyVideo),
      2,
      "StoryVideo should have download count of 2 (1 video + index.md)",
    );
  });

  it("should return 2 for StoryWatch (1 video + index.md)", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const storyWatch = result.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");
    assert.strictEqual(
      getDownloadCount(storyWatch),
      2,
      "StoryWatch should have download count of 2 (1 video + index.md)",
    );
  });

  it("should return 2 for shorts video StoryPost (1 video + index.md)", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-shorts-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const shortsStory = result.find(
      (s) => getStoryPostId(s) === "2223425971514935",
    );
    assert.ok(shortsStory, "Should find the shorts video story");
    assert.strictEqual(
      getAttachmentCount(shortsStory),
      1,
      "Shorts video story should have 1 attachment",
    );
    assert.strictEqual(
      getDownloadCount(shortsStory),
      2,
      "Shorts video story should have download count of 2 (1 video + index.md)",
    );
  });
});

describe("extractStories continued", () => {
  it("should extract StoryVideo from story-video.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    assert.ok(result.length > 0, "Should extract at least one story");

    const storyVideo = result.find(
      (s) => getStoryPostId(s) === "1140140214990654",
    );
    assert.ok(storyVideo, "Should find the StoryVideo");
    assert.strictEqual(
      getAttachmentCount(storyVideo),
      1,
      "StoryVideo should have 1 attachment",
    );
    assert.strictEqual(
      getStoryActor(storyVideo)?.name,
      "はじめてちゃれんじ",
      "Actor name should be はじめてちゃれんじ",
    );
  });

  it("should extract StoryWatch from story-watched-video.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    assert.strictEqual(result.length, 1, "Should extract exactly 1 story");

    const storyWatch = result.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");
    assert.strictEqual(
      getAttachmentCount(storyWatch),
      1,
      "StoryWatch should have 1 attachment",
    );
    assert.strictEqual(
      getStoryActor(storyWatch)?.name,
      "咩啊_Real",
      "Actor name should be 咩啊_Real",
    );
  });
});

describe("extractStoryGroupMap", () => {
  it("should extract group from story-user-group.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-user-group.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    assert.ok(stories.length > 0, "Should extract at least one story");

    extractStoryGroupMap(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "2282323118944469");
    assert.ok(story, "Should find the story");
    assert.strictEqual(
      getAttachmentCount(story),
      1,
      "Story should have 1 attachment",
    );
    assert.strictEqual(
      getStoryActor(story)?.name,
      "Kyle Lim",
      "Actor name should be Kyle Lim",
    );

    const group = getGroup(story);
    assert.ok(group, "Should extract group for the story");
    assert.strictEqual(group.__typename, "Group");
    assert.strictEqual(group.id, "1250325325477592");
    assert.strictEqual(group.name, "PS NINTENDO XBOX MALAYSIA CLUB (PNXC)");
  });

  it("should return undefined for story without group", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryGroupMap(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "1411731986983785");
    assert.ok(story, "Should find the story");
    assert.strictEqual(
      getAttachmentCount(story),
      0,
      "Story should have 0 attachments",
    );
    assert.strictEqual(
      getStoryActor(story)?.name,
      "蔡正元",
      "Actor name should be 蔡正元",
    );

    const group = getGroup(story);
    assert.strictEqual(
      group,
      undefined,
      "Text-only story should not have a group",
    );
  });
});

describe("extractStoryCreateTime", () => {
  it("should extract create time from StoryPost in story-text-only.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "1411731986983785");
    assert.ok(story, "Should find the story");

    const createTime = getCreateTime(story);
    assert.ok(createTime instanceof Date, "Create time should be a Date");
    assert.strictEqual(
      createTime.getTime(),
      1765657548 * 1000,
      "Create time should match expected timestamp",
    );
  });

  it("should extract create time from StoryPost in story-attachment-photo.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attachment-photo.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);

    const story = stories.find(
      (s) => getStoryPostId(s) === "25550089621287122",
    );
    assert.ok(story, "Should find the story");

    const createTime = getCreateTime(story);
    assert.ok(createTime instanceof Date, "Create time should be a Date");
    assert.strictEqual(
      createTime.getTime(),
      1765769968 * 1000,
      "Create time should match expected timestamp",
    );
  });

  it("should extract create time from StoryPost in story-user-group.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-user-group.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "2282323118944469");
    assert.ok(story, "Should find the story");

    const createTime = getCreateTime(story);
    assert.ok(createTime instanceof Date, "Create time should be a Date");
    assert.strictEqual(
      createTime.getTime(),
      1766143457 * 1000,
      "Create time should match expected timestamp",
    );
  });

  it("should extract create time for main and attached story from story-attached-story.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);

    const mainStory = /** @type {StoryPost} */ (
      stories.find((s) => getStoryPostId(s) === "1414037856753198")
    );
    assert.ok(mainStory, "Should find the main story");

    const mainCreateTime = getCreateTime(mainStory);
    assert.ok(
      mainCreateTime instanceof Date,
      "Main story create time should be a Date",
    );
    assert.strictEqual(
      mainCreateTime.getTime(),
      1765933099 * 1000,
      "Main story create time should match expected timestamp",
    );

    assert.ok(
      mainStory.attached_story,
      "Main story should have attached_story",
    );
    const attachedCreateTime = getCreateTime(mainStory.attached_story);
    assert.ok(
      attachedCreateTime instanceof Date,
      "Attached story create time should be a Date",
    );
    assert.strictEqual(
      attachedCreateTime.getTime(),
      1765843787 * 1000,
      "Attached story create time should match expected timestamp",
    );
  });

  it("should extract create time from StoryVideo media.publish_time", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-video.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);

    const storyVideo = stories.find(
      (s) => getStoryPostId(s) === "1140140214990654",
    );
    assert.ok(storyVideo, "Should find the StoryVideo");

    const createTime = getCreateTime(storyVideo);
    assert.ok(createTime instanceof Date, "Create time should be a Date");
    assert.strictEqual(
      createTime.getTime(),
      1762675355 * 1000,
      "Create time should match publish_time",
    );
  });

  it("should extract create time from StoryWatch metadata", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);

    const storyWatch = stories.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");

    const createTime = getCreateTime(storyWatch);
    assert.ok(createTime instanceof Date, "Create time should be a Date");
    assert.strictEqual(
      createTime.getTime(),
      1737889218 * 1000,
      "Create time should match creation_time from metadata",
    );
  });

  it("should return undefined for story without create time data", () => {
    const fakeStory = /** @type {Story} */ ({
      id: "non-existent-story-id",
      post_id: "999",
      wwwURL: "url",
      attachments: [],
      message: null,
      attached_story: null,
      actors: [{ __typename: "User", id: "1", name: "Test" }],
    });

    const createTime = getCreateTime(fakeStory);
    assert.strictEqual(
      createTime,
      undefined,
      "Should return undefined for story without create time",
    );
  });
});

describe("extractVideoUrls", () => {
  it("should extract video URLs from story-watched-video.json", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );

    extractVideoUrls(mockData);

    const stories = extractStories(mockData);
    const storyWatch = stories.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");
  });
});

describe("getStoryUrl", () => {
  it("should return wwwURL for StoryPost", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );
    const stories = extractStories(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "1411731986983785");
    assert.ok(story, "Should find the story");

    const url = getStoryUrl(story);
    assert.ok(url.includes("facebook.com"), "URL should be a Facebook URL");
  });

  it("should return watch URL for StoryVideo", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const storyVideo = result.find(
      (s) => getStoryPostId(s) === "1140140214990654",
    );
    assert.ok(storyVideo, "Should find the StoryVideo");

    const url = getStoryUrl(storyVideo);
    assert.strictEqual(
      url,
      "https://www.facebook.com/watch/?v=1303605278204660",
      "StoryVideo URL should be watch URL",
    );
  });

  it("should return watch URL for StoryWatch", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const storyWatch = result.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");

    const url = getStoryUrl(storyWatch);
    assert.strictEqual(
      url,
      "https://www.facebook.com/watch/?v=1403115984005683",
      "StoryWatch URL should be watch URL",
    );
  });
});

describe("getStoryMessage", () => {
  it("should return message for StoryPost", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );
    const stories = extractStories(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "1411731986983785");
    assert.ok(story, "Should find the story");

    const message = getStoryMessage(story);
    assert.ok(typeof message === "string", "Message should be a string");
  });

  it("should return message for StoryWatch from comet_sections", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );
    const result = extractStories(mockData);

    const storyWatch = result.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");

    const message = getStoryMessage(storyWatch);
    assert.strictEqual(
      message,
      "當你穿越回以前的廣東過年...",
      "StoryWatch message should be extracted from comet_sections",
    );
  });
});

describe("getStoryMediaTitle", () => {
  it("should return undefined for StoryPost", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );
    const stories = extractStories(mockData);

    const storyPost = stories.find(
      (s) => getStoryPostId(s) === "1411731986983785",
    );
    assert.ok(storyPost, "Should find the StoryPost");

    const title = getStoryMediaTitle(storyPost);
    assert.strictEqual(
      title,
      undefined,
      "StoryPost should not have media title",
    );
  });

  it("should return media.name for StoryVideo", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-video.json"), "utf8"),
    );
    const stories = extractStories(mockData);

    const storyVideo = stories.find(
      (s) => getStoryPostId(s) === "1140140214990654",
    );
    assert.ok(storyVideo, "Should find the StoryVideo");

    const title = getStoryMediaTitle(storyVideo);
    assert.strictEqual(
      title,
      "THIS IS MEDIA NAME",
      "StoryVideo media title should be media.name",
    );
  });

  it("should return title.text for StoryWatch", () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );
    const stories = extractStories(mockData);

    const storyWatch = stories.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");

    const title = getStoryMediaTitle(storyWatch);
    assert.strictEqual(
      title,
      "【咩啊_Real】當你回到以前的廣東過年",
      "StoryWatch media title should be extracted from title.text",
    );
  });
});

describe("downloadStory", () => {
  it("should download text-only StoryPost from story-text-only.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-text-only.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "1411731986983785");
    assert.ok(story, "Should find the story");

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      1,
      "Should have 1 download for text-only story",
    );

    const indexDownload = downloads[0];
    assert.ok(
      indexDownload.filename.endsWith("/index.md"),
      "Should have index.md file",
    );
    assert.ok(
      indexDownload.url.startsWith("data:text/markdown;charset=utf-8,"),
      "Should be a data URL",
    );

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes(getStoryUrl(story)),
      "Markdown should include the story URL",
    );
    assert.ok(
      markdownContent.includes("蔡正元"),
      "Markdown should include the actor name",
    );
    assert.ok(
      markdownContent.includes("2025-12-13"),
      "Markdown should include the date",
    );

    const folderName = indexDownload.filename.split("/")[0];
    assert.ok(
      folderName.includes("2025-12-13"),
      "Folder name should include date",
    );
    assert.ok(
      folderName.includes("蔡正元"),
      "Folder name should include actor name",
    );
    assert.ok(
      folderName.includes("1411731986983785"),
      "Folder name should include post_id",
    );
  });

  it("should download StoryPost with photo attachments from story-attachment-photo.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attachment-photo.json"), "utf8"),
    );

    const photoIds = [
      "10236779894211730",
      "10236779894131728",
      "10236779894291732",
      "10236779894371734",
    ];

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = stories.find(
      (s) => getStoryPostId(s) === "25550089621287122",
    );
    assert.ok(story, "Should find the story");
    assert.strictEqual(
      getAttachmentCount(story),
      4,
      "Story should have 4 attachments",
    );

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      5,
      "Should have 5 downloads (4 photos + index.md)",
    );

    const photoDownloads = downloads.filter((d) => d.filename.endsWith(".jpg"));
    assert.strictEqual(
      photoDownloads.length,
      4,
      "Should have 4 photo downloads",
    );

    for (const photoId of photoIds) {
      const photoDownload = photoDownloads.find((d) =>
        d.filename.includes(photoId),
      );
      assert.ok(photoDownload, `Should have download for photo ${photoId}`);
    }

    const indexDownload = downloads.find((d) =>
      d.filename.endsWith("/index.md"),
    );
    assert.ok(indexDownload, "Should have index.md file");

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes(getStoryUrl(story)),
      "Markdown should include the story URL",
    );
    assert.ok(
      markdownContent.includes("Kimi Cui"),
      "Markdown should include the actor name",
    );
    assert.ok(
      markdownContent.includes("!["),
      "Markdown should include image references",
    );

    const folderName = indexDownload.filename.split("/")[0];
    assert.ok(
      folderName.includes("Kimi Cui"),
      "Folder name should include actor name",
    );
    assert.ok(
      folderName.includes("25550089621287122"),
      "Folder name should include post_id",
    );
  });

  it("should download StoryPost with photo attachments using mediaset response format", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attachment-photo.json"), "utf8"),
    );

    const photoIds = [
      "10236779894211730",
      "10236779894131728",
      "10236779894291732",
      "10236779894371734",
    ];

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = stories.find(
      (s) => getStoryPostId(s) === "25550089621287122",
    );
    assert.ok(story, "Should find the story");
    assert.strictEqual(
      getAttachmentCount(story),
      4,
      "Story should have 4 attachments",
    );

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      5,
      "Should have 5 downloads (4 photos + index.md)",
    );

    const photoDownloads = downloads.filter((d) => d.filename.endsWith(".jpg"));
    assert.strictEqual(
      photoDownloads.length,
      4,
      "Should have 4 photo downloads",
    );

    for (const photoId of photoIds) {
      const photoDownload = photoDownloads.find((d) =>
        d.filename.includes(photoId),
      );
      assert.ok(photoDownload, `Should have download for photo ${photoId}`);
    }
  });

  it("should fetch additional media via fetchMediaNav when story has more attachments than nodes", async () => {
    // Create a story where all_subattachments.count > nodes.length
    // This will trigger the fetchMediaNav fallback path
    /** @type {StoryPost} */
    const story = {
      id: "test-story-id",
      post_id: "test-post-id",
      wwwURL: "https://www.facebook.com/test/posts/test-post-id",
      actors: [{ __typename: "User", id: "123", name: "Test User" }],
      message: { text: "Test message" },
      attachments: [
        {
          styles: {
            attachment: {
              all_subattachments: {
                count: 3, // Says there are 3 attachments
                nodes: [
                  // But only provides 1 in nodes array
                  {
                    media: {
                      __typename: "Photo",
                      id: "photo-1",
                      image: {
                        uri: "https://example.com/photo1.jpg",
                        width: 100,
                        height: 100,
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
      attached_story: null,
    };

    // Set up mock to return additional photos via fetchMediaNav
    mockSendGraphqlRequestImpl = async ({ apiName, variables }) => {
      if (apiName === "CometPhotoRootContentQuery") {
        const nodeID = /** @type {string} */ (variables.nodeID);
        if (nodeID === "photo-1") {
          // Return nextId pointing to photo-2
          return [
            {
              data: {
                currMedia: {
                  __typename: "Photo",
                  id: "photo-1",
                  image: {
                    uri: "https://example.com/photo1.jpg",
                    width: 100,
                    height: 100,
                  },
                },
                nextMediaAfterNodeId: { __typename: "Photo", id: "photo-2" },
              },
            },
          ];
        }
        if (nodeID === "photo-2") {
          // Return photo-2 data and nextId pointing to photo-3
          return [
            {
              data: {
                currMedia: {
                  __typename: "Photo",
                  id: "photo-2",
                  image: {
                    uri: "https://example.com/photo2.jpg",
                    width: 200,
                    height: 200,
                  },
                },
                nextMediaAfterNodeId: { __typename: "Photo", id: "photo-3" },
              },
            },
          ];
        }
        if (nodeID === "photo-3") {
          // Return photo-3 data, no nextId (last photo)
          return [
            {
              data: {
                currMedia: {
                  __typename: "Photo",
                  id: "photo-3",
                  image: {
                    uri: "https://example.com/photo3.jpg",
                    width: 300,
                    height: 300,
                  },
                },
                nextMediaAfterNodeId: null,
              },
            },
          ];
        }
      }
      return [];
    };

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    // Reset mock
    mockSendGraphqlRequestImpl = async () => [];

    // Should have 4 downloads: 3 photos + index.md
    assert.strictEqual(
      downloads.length,
      4,
      "Should have 4 downloads (3 photos + index.md)",
    );

    const photoDownloads = downloads.filter((d) => d.filename.endsWith(".jpg"));
    assert.strictEqual(
      photoDownloads.length,
      3,
      "Should have 3 photo downloads",
    );

    // Verify each photo was downloaded
    assert.ok(
      photoDownloads.find((d) => d.filename.includes("photo-1")),
      "Should have photo-1",
    );
    assert.ok(
      photoDownloads.find((d) => d.filename.includes("photo-2")),
      "Should have photo-2",
    );
    assert.ok(
      photoDownloads.find((d) => d.filename.includes("photo-3")),
      "Should have photo-3",
    );

    // Verify URLs
    assert.ok(
      photoDownloads.find((d) => d.url === "https://example.com/photo1.jpg"),
      "Should have photo1 URL",
    );
    assert.ok(
      photoDownloads.find((d) => d.url === "https://example.com/photo2.jpg"),
      "Should have photo2 URL",
    );
    assert.ok(
      photoDownloads.find((d) => d.url === "https://example.com/photo3.jpg"),
      "Should have photo3 URL",
    );
  });

  it("should fetch additional video media via fetchMediaNav when story has more attachments than nodes", async () => {
    // Create a story where all_subattachments.count > nodes.length with video media
    // This will trigger the fetchMediaNav fallback path using CometVideoRootMediaViewerQuery
    /** @type {StoryPost} */
    const story = {
      id: "test-video-story-id",
      post_id: "test-video-post-id",
      wwwURL: "https://www.facebook.com/test/posts/test-video-post-id",
      actors: [{ __typename: "User", id: "456", name: "Video User" }],
      message: { text: "Test video message" },
      attachments: [
        {
          styles: {
            attachment: {
              all_subattachments: {
                count: 2, // Says there are 2 attachments
                nodes: [
                  // But only provides 1 in nodes array
                  {
                    media: {
                      __typename: "Video",
                      id: "video-1",
                      videoDeliveryResponseFragment: {
                        videoDeliveryResponseResult: {
                          progressive_urls: [
                            {
                              progressive_url:
                                "https://example.com/video1_hd.mp4",
                              metadata: { quality: "HD" },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
      attached_story: null,
    };

    // Set up mock to return additional video via fetchMediaNav
    mockSendGraphqlRequestImpl = async ({ apiName, variables }) => {
      if (apiName === "CometVideoRootMediaViewerQuery") {
        const nodeID = /** @type {string} */ (variables.nodeID);
        if (nodeID === "video-1") {
          // Return nextId pointing to video-2 using mediaset format
          return [
            {
              data: {
                mediaset: {
                  currMedia: {
                    edges: [
                      {
                        node: {
                          __typename: "Video",
                          id: "video-1",
                          videoDeliveryResponseFragment: {
                            videoDeliveryResponseResult: {
                              progressive_urls: [
                                {
                                  progressive_url:
                                    "https://example.com/video1_hd.mp4",
                                  metadata: { quality: "HD" },
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
                nextMediaAfterNodeId: { __typename: "Video", id: "video-2" },
              },
            },
          ];
        }
        if (nodeID === "video-2") {
          // Return video-2 data, no nextId (last video) using mediaset format
          return [
            {
              data: {
                mediaset: {
                  currMedia: {
                    edges: [
                      {
                        node: {
                          __typename: "Video",
                          id: "video-2",
                          videoDeliveryResponseFragment: {
                            videoDeliveryResponseResult: {
                              progressive_urls: [
                                {
                                  progressive_url:
                                    "https://example.com/video2_hd.mp4",
                                  metadata: { quality: "HD" },
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
                nextMediaAfterNodeId: null,
              },
            },
          ];
        }
      }
      return [];
    };

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    // Reset mock
    mockSendGraphqlRequestImpl = async () => [];

    // Should have 3 downloads: 2 videos + index.md
    assert.strictEqual(
      downloads.length,
      3,
      "Should have 3 downloads (2 videos + index.md)",
    );

    const videoDownloads = downloads.filter((d) => d.filename.endsWith(".mp4"));
    assert.strictEqual(
      videoDownloads.length,
      2,
      "Should have 2 video downloads",
    );

    // Verify each video was downloaded
    assert.ok(
      videoDownloads.find((d) => d.filename.includes("video-1")),
      "Should have video-1",
    );
    assert.ok(
      videoDownloads.find((d) => d.filename.includes("video-2")),
      "Should have video-2",
    );

    // Verify URLs
    assert.ok(
      videoDownloads.find((d) => d.url === "https://example.com/video1_hd.mp4"),
      "Should have video1 URL",
    );
    assert.ok(
      videoDownloads.find((d) => d.url === "https://example.com/video2_hd.mp4"),
      "Should have video2 URL",
    );
  });

  it("should download StoryPost with group from story-user-group.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-user-group.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "2282323118944469");
    assert.ok(story, "Should find the story");

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    const indexDownload = downloads.find((d) =>
      d.filename.endsWith("/index.md"),
    );
    assert.ok(indexDownload, "Should have index.md file");

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes("PS NINTENDO XBOX MALAYSIA CLUB"),
      "Markdown should include the group name",
    );
    assert.ok(
      markdownContent.includes("Kyle Lim"),
      "Markdown should include the actor name",
    );

    const folderName = indexDownload.filename.split("/")[0];
    assert.ok(
      folderName.includes("PS NINTENDO XBOX MALAYSIA CLUB"),
      "Folder name should include group name",
    );
    assert.ok(
      folderName.includes("Kyle Lim"),
      "Folder name should include actor name",
    );
    assert.ok(
      folderName.includes("2282323118944469"),
      "Folder name should include post_id",
    );
  });

  it("should download StoryPost with attached story from story-attached-story.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story.json"), "utf8"),
    );

    const attachedPhotoId = "1284281187062002";

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = /** @type {StoryPost} */ (
      stories.find((s) => getStoryPostId(s) === "1414037856753198")
    );
    assert.ok(story, "Should find the story");
    assert.ok(story.attached_story, "Story should have attached_story");
    assert.strictEqual(
      getAttachmentCount(story),
      0,
      "Main story should have 0 attachments",
    );
    assert.strictEqual(
      getAttachmentCount(story.attached_story),
      1,
      "Attached story should have 1 attachment",
    );

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      2,
      "Should have 2 downloads (1 photo + index.md)",
    );

    const photoDownload = downloads.find((d) =>
      d.filename.includes(attachedPhotoId),
    );
    assert.ok(photoDownload, "Should have download for attached story photo");
    assert.ok(
      photoDownload.filename.endsWith(".jpg"),
      "Photo should have .jpg extension",
    );

    const indexDownload = downloads.find((d) =>
      d.filename.endsWith("/index.md"),
    );
    assert.ok(indexDownload, "Should have index.md file");

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes("蔡正元"),
      "Markdown should include the main actor name",
    );
    assert.ok(
      markdownContent.includes("> "),
      "Markdown should include blockquoted attached story",
    );
    assert.ok(
      markdownContent.includes("徐勝凌"),
      "Markdown should include the attached story actor name",
    );
  });

  it("should download StoryPost with attached story only from story-attached-story-only.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attached-story-only.json"), "utf8"),
    );

    const attachedPhotoId = "1422788539419067";

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = /** @type {StoryPost} */ (
      stories.find((s) => getStoryPostId(s) === "2280345139142267")
    );
    assert.ok(story, "Should find the story");
    assert.ok(story.attached_story, "Story should have attached_story");
    assert.strictEqual(
      getAttachmentCount(story),
      0,
      "Main story should have 0 attachments",
    );
    assert.strictEqual(
      getAttachmentCount(story.attached_story),
      1,
      "Attached story should have 1 attachment",
    );

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      2,
      "Should have 2 downloads (1 photo + index.md)",
    );

    const photoDownload = downloads.find((d) =>
      d.filename.includes(attachedPhotoId),
    );
    assert.ok(photoDownload, "Should have download for attached story photo");
    assert.ok(
      photoDownload.filename.endsWith(".jpg"),
      "Photo should have .jpg extension",
    );

    const indexDownload = downloads.find((d) =>
      d.filename.endsWith("/index.md"),
    );
    assert.ok(indexDownload, "Should have index.md file");

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes("Carol TianTian"),
      "Markdown should include the outer story actor name",
    );
    assert.ok(
      markdownContent.includes("> "),
      "Markdown should include blockquoted attached story",
    );
    assert.ok(
      markdownContent.includes("Anime Feels"),
      "Markdown should include the attached story actor name",
    );
  });

  it("should download StoryPost with video attachment from story-attachment-video.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-attachment-video.json"), "utf8"),
    );

    const videoId = "1800120837356279";

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const story = stories.find((s) => getStoryPostId(s) === "2284744602035654");
    assert.ok(story, "Should find the story");
    assert.strictEqual(
      getAttachmentCount(story),
      1,
      "Story should have 1 video attachment",
    );

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(story, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      2,
      "Should have 2 downloads (1 video + index.md)",
    );

    const videoDownload = downloads.find((d) => d.filename.includes(videoId));
    assert.ok(videoDownload, "Should have download for video");
    assert.ok(
      videoDownload.filename.endsWith(".mp4"),
      "Video should have .mp4 extension",
    );
    assert.ok(
      videoDownload.url.includes("720p"),
      "Should prefer HD quality video",
    );

    const indexDownload = downloads.find((d) =>
      d.filename.endsWith("/index.md"),
    );
    assert.ok(indexDownload, "Should have index.md file");

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes(getStoryUrl(story)),
      "Markdown should include the story URL",
    );
    assert.ok(
      markdownContent.includes("月 影"),
      "Markdown should include the actor name",
    );
    assert.ok(
      markdownContent.includes("PS NINTENDO XBOX MALAYSIA CLUB"),
      "Markdown should include the group name",
    );
    assert.ok(
      markdownContent.includes(`[0001_${videoId}.mp4]`),
      "Markdown should include video link",
    );
    assert.ok(
      !markdownContent.includes(`![0001_${videoId}.mp4]`),
      "Video should not be rendered as image",
    );

    const folderName = indexDownload.filename.split("/")[0];
    assert.ok(
      folderName.includes("月 影"),
      "Folder name should include actor name",
    );
    assert.ok(
      folderName.includes("2284744602035654"),
      "Folder name should include post_id",
    );
    assert.ok(
      folderName.includes("PS NINTENDO XBOX MALAYSIA CLUB"),
      "Folder name should include group name",
    );
  });

  it("should download StoryVideo from story-video.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-video.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const storyVideo = stories.find(
      (s) => getStoryPostId(s) === "1140140214990654",
    );
    assert.ok(storyVideo, "Should find the StoryVideo");
    assert.strictEqual(
      getAttachmentCount(storyVideo),
      1,
      "StoryVideo should have 1 attachment",
    );

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];
    await fetchStoryFiles(storyVideo, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      2,
      "Should have 2 downloads (1 video + index.md)",
    );

    const videoDownload = downloads.find((d) =>
      d.filename.includes("1303605278204660"),
    );
    assert.ok(videoDownload, "Should have download for video");
    assert.ok(
      videoDownload.filename.endsWith(".mp4"),
      "Video should have .mp4 extension",
    );
    assert.ok(
      videoDownload.url.includes("video."),
      "Should have video CDN URL",
    );

    const indexDownload = downloads.find((d) =>
      d.filename.endsWith("/index.md"),
    );
    assert.ok(indexDownload, "Should have index.md file");

    const markdownContent = decodeURIComponent(
      indexDownload.url.replace("data:text/markdown;charset=utf-8,", ""),
    );
    assert.ok(
      markdownContent.includes(getStoryUrl(storyVideo)),
      "Markdown should include the story URL",
    );
    assert.ok(
      markdownContent.includes("はじめてちゃれんじ"),
      "Markdown should include the actor name",
    );
    assert.ok(
      markdownContent.includes("**THIS IS MEDIA NAME**"),
      "Markdown should include video title in bold",
    );
    assert.ok(
      markdownContent.includes("[0001_1303605278204660.mp4]"),
      "Markdown should include video link",
    );
    assert.ok(
      !markdownContent.includes("![0001_1303605278204660.mp4]"),
      "Video should not be rendered as image",
    );

    const folderName = indexDownload.filename.split("/")[0];
    assert.ok(
      folderName.includes("はじめてちゃれんじ"),
      "Folder name should include actor name",
    );
    assert.ok(
      folderName.includes("1140140214990654"),
      "Folder name should include post_id",
    );
  });

  it("should download StoryWatch from story-watched-video.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-watched-video.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractVideoUrls(mockData);

    const storyWatch = stories.find(
      (s) => getStoryPostId(s) === "1403115984005683",
    );
    assert.ok(storyWatch, "Should find the StoryWatch");

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];

    await fetchStoryFiles(storyWatch, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      2,
      "Should download 2 files (markdown + video)",
    );

    const mdDownload = downloads.find((d) => d.filename.endsWith(".md"));
    assert.ok(mdDownload, "Should download markdown file");
    assert.ok(
      mdDownload.filename.includes("1403115984005683"),
      "Markdown filename should include post ID",
    );

    const videoDownload = downloads.find((d) => d.filename.endsWith(".mp4"));
    assert.ok(videoDownload, "Should download video file");
    assert.ok(
      videoDownload.url.includes("video.fyvr1-1.fna.fbcdn.net"),
      "Should download video from Facebook CDN",
    );
  });

  it("should download StoryPost shorts video from story-shorts-video.json", async () => {
    const mockData = JSON.parse(
      readFileSync(join(__dirname, "story-shorts-video.json"), "utf8"),
    );

    const stories = extractStories(mockData);
    extractStoryCreateTime(mockData);
    extractStoryGroupMap(mockData);

    const shortsStory = stories.find(
      (s) => getStoryPostId(s) === "2223425971514935",
    );
    assert.ok(shortsStory, "Should find the shorts video story");

    /** @type {Array<{ storyId: string, url: string, filename: string }>} */
    const downloads = [];

    await fetchStoryFiles(shortsStory, (storyId, url, filename) => {
      downloads.push({ storyId, url, filename });
    });

    assert.strictEqual(
      downloads.length,
      2,
      "Should download 2 files (markdown + video)",
    );

    const mdDownload = downloads.find((d) => d.filename.endsWith(".md"));
    assert.ok(mdDownload, "Should download markdown file");
    assert.ok(
      mdDownload.filename.includes("2223425971514935"),
      "Markdown filename should include post ID",
    );

    const videoDownload = downloads.find((d) => d.filename.endsWith(".mp4"));
    assert.ok(videoDownload, "Should download video file");
    assert.ok(
      videoDownload.url.includes("video.fcxh3-1.fna.fbcdn.net"),
      "Should download video from Facebook CDN",
    );
  });
});
