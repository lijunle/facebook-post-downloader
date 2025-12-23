import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * @typedef {import('../extensions/types').StoryPost} StoryPost
 * @typedef {import('../extensions/types').StoryVideo} StoryVideo
 * @typedef {import('../extensions/types').Story} Story
 * @typedef {{ id: string, nextId?: string, type?: 'Photo' | 'Video' }} MockMediaConfig
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Global mock configuration that test cases can set up
 * @type {Map<string, MockMediaConfig>}
 */
const mockMediaConfig = new Map();

/**
 * Helper to set up mock media for a test case
 * @param {string[]} mediaIds - Array of media IDs in navigation order
 * @param {'Photo' | 'Video'} [type='Photo'] - Type of media
 */
function setupMockMedia(mediaIds, type = 'Photo') {
    mockMediaConfig.clear();
    for (let i = 0; i < mediaIds.length; i++) {
        const id = mediaIds[i];
        const nextId = i + 1 < mediaIds.length ? mediaIds[i + 1] : undefined;
        mockMediaConfig.set(id, { id, nextId, type });
    }
}

/**
 * Mock sendGraphqlRequest that returns media navigation data based on mockMediaConfig
 * @param {{ apiName: string, variables: { nodeID?: string } }} params
 */
async function mockSendGraphqlRequest({ apiName, variables }) {
    if (apiName === 'CometPhotoRootContentQuery' && variables.nodeID) {
        const config = mockMediaConfig.get(variables.nodeID);
        if (config) {
            /** @type {any} */
            let currMedia;
            if (config.type === 'Video') {
                currMedia = {
                    __typename: 'Video',
                    id: config.id,
                    videoDeliveryResponseFragment: {
                        videoDeliveryResponseResult: {
                            progressive_urls: [
                                { progressive_url: `https://example.com/video_${config.id}_hd.mp4`, metadata: { quality: 'HD' } },
                                { progressive_url: `https://example.com/video_${config.id}_sd.mp4`, metadata: { quality: 'SD' } }
                            ]
                        }
                    }
                };
            } else {
                currMedia = {
                    __typename: 'Photo',
                    id: config.id,
                    image: { uri: `https://example.com/photo_${config.id}.jpg` }
                };
            }
            return [{
                data: {
                    currMedia,
                    nextMediaAfterNodeId: config.nextId ? { id: config.nextId } : null,
                    prevMediaBeforeNodeId: null
                }
            }];
        }
    }
    return [];
}

// Mock graphql.js before importing story.js
mock.module('../extensions/graphql.js', {
    namedExports: {
        getLocation: () => ({
            host: 'www.facebook.com',
            pathname: '/test'
        }),
        graphqlListener: () => { },
        sendGraphqlRequest: mockSendGraphqlRequest
    }
});

const { extractStories, extractStoryGroupMap, getGroup, extractStoryCreateTime, getCreateTime, getAttachmentCount, getDownloadCount, downloadStory, getStoryUrl, getStoryPostId, getStoryActor, getStoryMessage, extractVideoUrls, getStoryMediaTitle } = await import('../extensions/story.js');

describe('extractStories', () => {
    it('should extract text-only StoryPost from story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        assert.ok(result.length > 0, 'Should extract at least one story');

        const textOnlyStory = result.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(textOnlyStory, 'Should find the text-only story');
        assert.strictEqual(getAttachmentCount(textOnlyStory), 0, 'Text-only story should have 0 attachments');
        assert.strictEqual(getStoryActor(textOnlyStory)?.name, '蔡正元', 'Actor name should be 蔡正元');
    });

    it('should extract StoryPost with photo attachments from story-attachment-photo.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));
        const result = extractStories(mockData);

        assert.ok(result.length > 0, 'Should extract at least one story');

        const storyWithAttachments = result.find(s => getStoryPostId(s) === '25550089621287122');
        assert.ok(storyWithAttachments, 'Should find the story with attachments');
        assert.strictEqual(getAttachmentCount(storyWithAttachments), 4, 'Story should have 4 attachments');
        assert.strictEqual(getStoryActor(storyWithAttachments)?.name, 'Kimi Cui', 'Actor name should be Kimi Cui');
    });

    it('should extract StoryPost with attached story from story-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));
        const result = extractStories(mockData);

        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        const mainStory = /** @type {StoryPost} */ (result.find(s => getStoryPostId(s) === '1414037856753198'));
        assert.ok(mainStory, 'Main story should be extracted');
        assert.strictEqual(getAttachmentCount(mainStory), 0, 'Main story should have 0 attachments');
        assert.strictEqual(getStoryActor(mainStory)?.name, '蔡正元', 'Main story actor name should be 蔡正元');

        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(getStoryPostId(mainStory.attached_story), '1284281217061999', 'Attached story should have correct post_id');
        assert.strictEqual(getAttachmentCount(mainStory.attached_story), 1, 'Attached story should have 1 attachment');
        assert.strictEqual(getStoryActor(mainStory.attached_story)?.name, '徐勝凌', 'Attached story actor name should be 徐勝凌');
    });

    it('should extract StoryPost with attached story only from story-attached-story-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story-only.json'), 'utf8'));
        const result = extractStories(mockData);

        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        const mainStory = /** @type {StoryPost} */ (result.find(s => getStoryPostId(s) === '2280345139142267'));
        assert.ok(mainStory, 'Main story should be extracted');

        assert.ok(!getStoryMessage(mainStory), 'Outer story should have no message');
        assert.strictEqual(getAttachmentCount(mainStory), 0, 'Outer story should have 0 attachments');
        assert.strictEqual(getStoryActor(mainStory)?.name, 'Carol TianTian', 'Outer story actor name should be Carol TianTian');

        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(getStoryPostId(mainStory.attached_story), '1422788562752398', 'Attached story should have correct post_id');

        assert.ok(getStoryMessage(mainStory.attached_story), 'Attached story should have message');
        assert.strictEqual(getAttachmentCount(mainStory.attached_story), 1, 'Attached story should have 1 attachment');
        assert.strictEqual(getStoryActor(mainStory.attached_story)?.name, 'Anime Feels', 'Attached story actor name should be Anime Feels');
    });

    it('should deduplicate stories and prefer ones with wwwURL', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        const postIds = result.map(s => getStoryPostId(s));
        const uniquePostIds = [...new Set(postIds)];
        assert.strictEqual(postIds.length, uniquePostIds.length, 'All post_ids should be unique');

        const storyWithUrl = /** @type {StoryPost | undefined} */ (result.find(s => getStoryPostId(s) === '1411731986983785'));
        if (storyWithUrl) {
            assert.ok(storyWithUrl.wwwURL, 'Should prefer story with wwwURL');
        }
    });
});

describe('getDownloadCount', () => {
    it('should return 1 for text-only story (index.md only)', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        const textOnlyStory = result.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(textOnlyStory, 'Should find the text-only story');
        assert.strictEqual(getDownloadCount(textOnlyStory), 1, 'Text-only story should have download count of 1 (index.md only)');
    });

    it('should return attachments + 1 for story with photo attachments', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));
        const result = extractStories(mockData);

        const storyWithAttachments = result.find(s => getStoryPostId(s) === '25550089621287122');
        assert.ok(storyWithAttachments, 'Should find the story with attachments');
        assert.strictEqual(getDownloadCount(storyWithAttachments), 5, 'Story with 4 attachments should have download count of 5 (4 photos + index.md)');
    });

    it('should include attached_story attachments in count', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));
        const result = extractStories(mockData);

        const mainStory = /** @type {StoryPost} */ (result.find(s => getStoryPostId(s) === '1414037856753198'));
        assert.ok(mainStory, 'Should find the main story');
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        // 0 attachments + 1 index.md + 1 attached_story attachment = 2
        assert.strictEqual(getDownloadCount(mainStory), 2, 'Story with attached_story should include attached_story attachments in count');
    });

    it('should include attached_story attachments for story-attached-story-only', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story-only.json'), 'utf8'));
        const result = extractStories(mockData);

        const mainStory = /** @type {StoryPost} */ (result.find(s => getStoryPostId(s) === '2280345139142267'));
        assert.ok(mainStory, 'Should find the main story');
        // 0 attachments + 1 index.md + 1 attached_story attachment = 2
        assert.strictEqual(getDownloadCount(mainStory), 2, 'Story with only attached_story should have download count of 2');
    });

    it('should return 2 for StoryVideo (1 video + index.md)', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-video.json'), 'utf8'));
        const result = extractStories(mockData);

        const storyVideo = result.find(s => getStoryPostId(s) === '1140140214990654');
        assert.ok(storyVideo, 'Should find the StoryVideo');
        assert.strictEqual(getDownloadCount(storyVideo), 2, 'StoryVideo should have download count of 2 (1 video + index.md)');
    });

    it('should return 2 for StoryWatch (1 video + index.md)', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));
        const result = extractStories(mockData);

        const storyWatch = result.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');
        assert.strictEqual(getDownloadCount(storyWatch), 2, 'StoryWatch should have download count of 2 (1 video + index.md)');
    });
});

describe('extractStories continued', () => {
    it('should extract StoryVideo from story-video.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-video.json'), 'utf8'));
        const result = extractStories(mockData);

        assert.ok(result.length > 0, 'Should extract at least one story');

        const storyVideo = result.find(s => getStoryPostId(s) === '1140140214990654');
        assert.ok(storyVideo, 'Should find the StoryVideo');
        assert.strictEqual(getAttachmentCount(storyVideo), 1, 'StoryVideo should have 1 attachment');
        assert.strictEqual(getStoryActor(storyVideo)?.name, 'はじめてちゃれんじ', 'Actor name should be はじめてちゃれんじ');
    });

    it('should extract StoryWatch from story-watched-video.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));
        const result = extractStories(mockData);

        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        const storyWatch = result.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');
        assert.strictEqual(getAttachmentCount(storyWatch), 1, 'StoryWatch should have 1 attachment');
        assert.strictEqual(getStoryActor(storyWatch)?.name, '咩啊_Real', 'Actor name should be 咩啊_Real');
    });
});

describe('extractStoryGroupMap', () => {
    it('should extract group from story-user-group.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-user-group.json'), 'utf8'));

        const stories = extractStories(mockData);
        assert.ok(stories.length > 0, 'Should extract at least one story');

        extractStoryGroupMap(mockData);

        const story = stories.find(s => getStoryPostId(s) === '2282323118944469');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 1, 'Story should have 1 attachment');
        assert.strictEqual(getStoryActor(story)?.name, 'Kyle Lim', 'Actor name should be Kyle Lim');

        const group = getGroup(story);
        assert.ok(group, 'Should extract group for the story');
        assert.strictEqual(group.__typename, 'Group');
        assert.strictEqual(group.id, '1250325325477592');
        assert.strictEqual(group.name, 'PS NINTENDO XBOX MALAYSIA CLUB (PNXC)');
    });

    it('should return undefined for story without group', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 0, 'Story should have 0 attachments');
        assert.strictEqual(getStoryActor(story)?.name, '蔡正元', 'Actor name should be 蔡正元');

        const group = getGroup(story);
        assert.strictEqual(group, undefined, 'Text-only story should not have a group');
    });
});

describe('extractStoryCreateTime', () => {
    it('should extract create time from StoryPost in story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1765657548 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time from StoryPost in story-attachment-photo.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => getStoryPostId(s) === '25550089621287122');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1765769968 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time from StoryPost in story-user-group.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-user-group.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => getStoryPostId(s) === '2282323118944469');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1766143457 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time for main and attached story from story-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const mainStory = /** @type {StoryPost} */ (stories.find(s => getStoryPostId(s) === '1414037856753198'));
        assert.ok(mainStory, 'Should find the main story');

        const mainCreateTime = getCreateTime(mainStory);
        assert.ok(mainCreateTime instanceof Date, 'Main story create time should be a Date');
        assert.strictEqual(mainCreateTime.getTime(), 1765933099 * 1000, 'Main story create time should match expected timestamp');

        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        const attachedCreateTime = getCreateTime(mainStory.attached_story);
        assert.ok(attachedCreateTime instanceof Date, 'Attached story create time should be a Date');
        assert.strictEqual(attachedCreateTime.getTime(), 1765843787 * 1000, 'Attached story create time should match expected timestamp');
    });

    it('should extract create time from StoryVideo media.publish_time', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-video.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const storyVideo = stories.find(s => getStoryPostId(s) === '1140140214990654');
        assert.ok(storyVideo, 'Should find the StoryVideo');

        const createTime = getCreateTime(storyVideo);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1762675355 * 1000, 'Create time should match publish_time');
    });

    it('should extract create time from StoryWatch metadata', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const storyWatch = stories.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');

        const createTime = getCreateTime(storyWatch);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1737889218 * 1000, 'Create time should match creation_time from metadata');
    });

    it('should return undefined for story without create time data', () => {
        const fakeStory = /** @type {Story} */ ({
            id: 'non-existent-story-id',
            post_id: '999',
            wwwURL: 'url',
            attachments: [],
            message: null,
            attached_story: null,
            actors: [{ __typename: 'User', id: '1', name: 'Test' }]
        });

        const createTime = getCreateTime(fakeStory);
        assert.strictEqual(createTime, undefined, 'Should return undefined for story without create time');
    });
});

describe('extractVideoUrls', () => {
    it('should extract video URLs from story-watched-video.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));

        extractVideoUrls(mockData);

        const stories = extractStories(mockData);
        const storyWatch = stories.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');
    });
});

describe('getStoryUrl', () => {
    it('should return wwwURL for StoryPost', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const stories = extractStories(mockData);

        const story = stories.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(story, 'Should find the story');

        const url = getStoryUrl(story);
        assert.ok(url.includes('facebook.com'), 'URL should be a Facebook URL');
    });

    it('should return watch URL for StoryVideo', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-video.json'), 'utf8'));
        const result = extractStories(mockData);

        const storyVideo = result.find(s => getStoryPostId(s) === '1140140214990654');
        assert.ok(storyVideo, 'Should find the StoryVideo');

        const url = getStoryUrl(storyVideo);
        assert.strictEqual(url, 'https://www.facebook.com/watch/?v=1303605278204660', 'StoryVideo URL should be watch URL');
    });

    it('should return watch URL for StoryWatch', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));
        const result = extractStories(mockData);

        const storyWatch = result.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');

        const url = getStoryUrl(storyWatch);
        assert.strictEqual(url, 'https://www.facebook.com/watch/?v=1403115984005683', 'StoryWatch URL should be watch URL');
    });
});

describe('getStoryMessage', () => {
    it('should return message for StoryPost', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const stories = extractStories(mockData);

        const story = stories.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(story, 'Should find the story');

        const message = getStoryMessage(story);
        assert.ok(typeof message === 'string', 'Message should be a string');
    });

    it('should return message for StoryWatch from comet_sections', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));
        const result = extractStories(mockData);

        const storyWatch = result.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');

        const message = getStoryMessage(storyWatch);
        assert.strictEqual(message, '當你穿越回以前的廣東過年...', 'StoryWatch message should be extracted from comet_sections');
    });
});

describe('getStoryMediaTitle', () => {
    it('should return undefined for StoryPost', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const stories = extractStories(mockData);

        const storyPost = stories.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(storyPost, 'Should find the StoryPost');

        const title = getStoryMediaTitle(storyPost);
        assert.strictEqual(title, undefined, 'StoryPost should not have media title');
    });

    it('should return media.name for StoryVideo', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-video.json'), 'utf8'));
        const stories = extractStories(mockData);

        const storyVideo = stories.find(s => getStoryPostId(s) === '1140140214990654');
        assert.ok(storyVideo, 'Should find the StoryVideo');

        const title = getStoryMediaTitle(storyVideo);
        assert.strictEqual(title, 'THIS IS MEDIA NAME', 'StoryVideo media title should be media.name');
    });

    it('should return title.text for StoryWatch', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));
        const stories = extractStories(mockData);

        const storyWatch = stories.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');

        const title = getStoryMediaTitle(storyWatch);
        assert.strictEqual(title, '【咩啊_Real】當你回到以前的廣東過年', 'StoryWatch media title should be extracted from title.text');
    });
});

describe('downloadStory', () => {
    it('should download text-only StoryPost from story-text-only.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => getStoryPostId(s) === '1411731986983785');
        assert.ok(story, 'Should find the story');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 1, 'Should have 1 download for text-only story');

        const indexDownload = downloads[0];
        assert.ok(indexDownload.filename.endsWith('/index.md'), 'Should have index.md file');
        assert.ok(indexDownload.url.startsWith('data:text/markdown;charset=utf-8,'), 'Should be a data URL');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(story)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('蔡正元'), 'Markdown should include the actor name');
        assert.ok(markdownContent.includes('2025-12-13'), 'Markdown should include the date');

        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('2025-12-13'), 'Folder name should include date');
        assert.ok(folderName.includes('蔡正元'), 'Folder name should include actor name');
        assert.ok(folderName.includes('1411731986983785'), 'Folder name should include post_id');
    });

    it('should download StoryPost with photo attachments from story-attachment-photo.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));

        const photoIds = ['10236779894211730', '10236779894131728', '10236779894291732', '10236779894371734'];
        setupMockMedia(photoIds);

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => getStoryPostId(s) === '25550089621287122');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 4, 'Story should have 4 attachments');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 5, 'Should have 5 downloads (4 photos + index.md)');

        const photoDownloads = downloads.filter(d => d.filename.endsWith('.jpg'));
        assert.strictEqual(photoDownloads.length, 4, 'Should have 4 photo downloads');

        for (const photoId of photoIds) {
            const photoDownload = photoDownloads.find(d => d.filename.includes(photoId));
            assert.ok(photoDownload, `Should have download for photo ${photoId}`);
            assert.ok(photoDownload.url.includes(photoId), `URL should contain photo id ${photoId}`);
        }

        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(story)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('Kimi Cui'), 'Markdown should include the actor name');
        assert.ok(markdownContent.includes('!['), 'Markdown should include image references');

        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('Kimi Cui'), 'Folder name should include actor name');
        assert.ok(folderName.includes('25550089621287122'), 'Folder name should include post_id');
    });

    it('should download StoryPost with group from story-user-group.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-user-group.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => getStoryPostId(s) === '2282323118944469');
        assert.ok(story, 'Should find the story');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Markdown should include the group name');
        assert.ok(markdownContent.includes('Kyle Lim'), 'Markdown should include the actor name');

        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Folder name should include group name');
        assert.ok(folderName.includes('Kyle Lim'), 'Folder name should include actor name');
        assert.ok(folderName.includes('2282323118944469'), 'Folder name should include post_id');
    });

    it('should download StoryPost with attached story from story-attached-story.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));

        const attachedPhotoId = '1284281187062002';
        setupMockMedia([attachedPhotoId]);

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = /** @type {StoryPost} */ (stories.find(s => getStoryPostId(s) === '1414037856753198'));
        assert.ok(story, 'Should find the story');
        assert.ok(story.attached_story, 'Story should have attached_story');
        assert.strictEqual(getAttachmentCount(story), 0, 'Main story should have 0 attachments');
        assert.strictEqual(getAttachmentCount(story.attached_story), 1, 'Attached story should have 1 attachment');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 photo + index.md)');

        const photoDownload = downloads.find(d => d.filename.includes(attachedPhotoId));
        assert.ok(photoDownload, 'Should have download for attached story photo');
        assert.ok(photoDownload.filename.endsWith('.jpg'), 'Photo should have .jpg extension');

        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes('蔡正元'), 'Markdown should include the main actor name');
        assert.ok(markdownContent.includes('> '), 'Markdown should include blockquoted attached story');
        assert.ok(markdownContent.includes('徐勝凌'), 'Markdown should include the attached story actor name');
    });

    it('should download StoryPost with attached story only from story-attached-story-only.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story-only.json'), 'utf8'));

        const attachedPhotoId = '1422788539419067';
        setupMockMedia([attachedPhotoId]);

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = /** @type {StoryPost} */ (stories.find(s => getStoryPostId(s) === '2280345139142267'));
        assert.ok(story, 'Should find the story');
        assert.ok(story.attached_story, 'Story should have attached_story');
        assert.strictEqual(getAttachmentCount(story), 0, 'Main story should have 0 attachments');
        assert.strictEqual(getAttachmentCount(story.attached_story), 1, 'Attached story should have 1 attachment');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 photo + index.md)');

        const photoDownload = downloads.find(d => d.filename.includes(attachedPhotoId));
        assert.ok(photoDownload, 'Should have download for attached story photo');
        assert.ok(photoDownload.filename.endsWith('.jpg'), 'Photo should have .jpg extension');

        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes('Carol TianTian'), 'Markdown should include the outer story actor name');
        assert.ok(markdownContent.includes('> '), 'Markdown should include blockquoted attached story');
        assert.ok(markdownContent.includes('Anime Feels'), 'Markdown should include the attached story actor name');
    });

    it('should download StoryPost with video attachment from story-attachment-video.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-video.json'), 'utf8'));

        const videoId = '1800120837356279';
        setupMockMedia([videoId], 'Video');

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => getStoryPostId(s) === '2284744602035654');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 1, 'Story should have 1 video attachment');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 video + index.md)');

        const videoDownload = downloads.find(d => d.filename.includes(videoId));
        assert.ok(videoDownload, 'Should have download for video');
        assert.ok(videoDownload.filename.endsWith('.mp4'), 'Video should have .mp4 extension');
        assert.ok(videoDownload.url.includes('_hd.mp4'), 'Should prefer HD quality video');

        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(story)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('月 影'), 'Markdown should include the actor name');
        assert.ok(markdownContent.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Markdown should include the group name');
        assert.ok(markdownContent.includes(`[0001_${videoId}.mp4]`), 'Markdown should include video link');
        assert.ok(!markdownContent.includes(`![0001_${videoId}.mp4]`), 'Video should not be rendered as image');

        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('月 影'), 'Folder name should include actor name');
        assert.ok(folderName.includes('2284744602035654'), 'Folder name should include post_id');
        assert.ok(folderName.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Folder name should include group name');
    });

    it('should download StoryVideo from story-video.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-video.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const storyVideo = stories.find(s => getStoryPostId(s) === '1140140214990654');
        assert.ok(storyVideo, 'Should find the StoryVideo');
        assert.strictEqual(getAttachmentCount(storyVideo), 1, 'StoryVideo should have 1 attachment');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(storyVideo, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 video + index.md)');

        const videoDownload = downloads.find(d => d.filename.includes('1303605278204660'));
        assert.ok(videoDownload, 'Should have download for video');
        assert.ok(videoDownload.filename.endsWith('.mp4'), 'Video should have .mp4 extension');
        assert.ok(videoDownload.url.includes('video.'), 'Should have video CDN URL');

        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(storyVideo)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('はじめてちゃれんじ'), 'Markdown should include the actor name');
        assert.ok(markdownContent.includes('**THIS IS MEDIA NAME**'), 'Markdown should include video title in bold');
        assert.ok(markdownContent.includes('[0001_1303605278204660.mp4]'), 'Markdown should include video link');
        assert.ok(!markdownContent.includes('![0001_1303605278204660.mp4]'), 'Video should not be rendered as image');

        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('はじめてちゃれんじ'), 'Folder name should include actor name');
        assert.ok(folderName.includes('1140140214990654'), 'Folder name should include post_id');
    });

    it('should download StoryWatch from story-watched-video.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-watched-video.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractVideoUrls(mockData);

        const storyWatch = stories.find(s => getStoryPostId(s) === '1403115984005683');
        assert.ok(storyWatch, 'Should find the StoryWatch');

        /** @type {Array<{ storyId: string, url: string, filename: string }>} */
        const downloads = [];

        await downloadStory(storyWatch, (storyId, url, filename) => {
            downloads.push({ storyId, url, filename });
        });

        assert.strictEqual(downloads.length, 2, 'Should download 2 files (markdown + video)');

        const mdDownload = downloads.find(d => d.filename.endsWith('.md'));
        assert.ok(mdDownload, 'Should download markdown file');
        assert.ok(mdDownload.filename.includes('1403115984005683'), 'Markdown filename should include post ID');

        const videoDownload = downloads.find(d => d.filename.endsWith('.mp4'));
        assert.ok(videoDownload, 'Should download video file');
        assert.ok(videoDownload.url.includes('video.fyvr1-1.fna.fbcdn.net'), 'Should download video from Facebook CDN');
    });
});
