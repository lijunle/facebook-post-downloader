import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * @typedef {import('../extensions/types').StoryPost} StoryPost
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

const { extractStories, extractStoryGroupMap, getGroup, extractStoryCreateTime, getCreateTime, getAttachmentCount, downloadStory, getStoryUrl } = await import('../extensions/story.js');

describe('extractStories', () => {
    it('should extract text-only story from story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the text-only story
        const textOnlyStory = result.find(s => s.post_id === '1411731986983785');
        assert.ok(textOnlyStory, 'Should find the text-only story');
        assert.strictEqual(getAttachmentCount(textOnlyStory), 0, 'Text-only story should have 0 attachments');
        assert.strictEqual(textOnlyStory.actors[0].name, '蔡正元', 'Actor name should be 蔡正元');
    });

    it('should extract story with photo attachments from story-attachment-photo.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the story with attachments
        const storyWithAttachments = result.find(s => s.post_id === '25550089621287122');
        assert.ok(storyWithAttachments, 'Should find the story with attachments');
        assert.strictEqual(getAttachmentCount(storyWithAttachments), 4, 'Story should have 4 attachments');
        assert.strictEqual(storyWithAttachments.actors[0].name, 'Kimi Cui', 'Actor name should be Kimi Cui');
    });

    it('should extract story with attached story from story-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should extract only 1 story (the main story with attached_story nested inside)
        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        // Should extract the main story
        const mainStory = /** @type {StoryPost} */ (result.find(s => s.post_id === '1414037856753198'));
        assert.ok(mainStory, 'Main story should be extracted');
        assert.strictEqual(getAttachmentCount(mainStory), 0, 'Main story should have 0 attachments');
        assert.strictEqual(mainStory.actors[0].name, '蔡正元', 'Main story actor name should be 蔡正元');

        // Main story should have attached_story
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(mainStory.attached_story.post_id, '1284281217061999', 'Attached story should have correct post_id');
        assert.strictEqual(getAttachmentCount(mainStory.attached_story), 1, 'Attached story should have 1 attachment');
        assert.strictEqual(mainStory.attached_story.actors[0].name, '徐勝凌', 'Attached story actor name should be 徐勝凌');
    });

    it('should extract story with attached story only from story-attached-story-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should extract only 1 story
        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        // Should extract the main story (outer story)
        const mainStory = /** @type {StoryPost} */ (result.find(s => s.post_id === '2280345139142267'));
        assert.ok(mainStory, 'Main story should be extracted');

        // Outer story has no message and no attachments
        assert.ok(!mainStory.message, 'Outer story should have no message');
        assert.strictEqual(getAttachmentCount(mainStory), 0, 'Outer story should have 0 attachments');
        assert.strictEqual(mainStory.actors[0].name, 'Carol TianTian', 'Outer story actor name should be Carol TianTian');

        // Main story should have attached_story with the substory
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(mainStory.attached_story.post_id, '1422788562752398', 'Attached story should have correct post_id');

        // Inner story (attached_story) has message and attachments
        assert.ok(mainStory.attached_story.message, 'Attached story should have message');
        assert.ok(mainStory.attached_story.message.text, 'Attached story message should have text');
        assert.strictEqual(getAttachmentCount(mainStory.attached_story), 1, 'Attached story should have 1 attachment');
        assert.strictEqual(mainStory.attached_story.actors[0].name, 'Anime Feels', 'Attached story actor name should be Anime Feels');
    });

    it('should deduplicate stories and prefer ones with wwwURL', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Check that post_ids are unique
        const postIds = result.map(s => s.post_id);
        const uniquePostIds = [...new Set(postIds)];
        assert.strictEqual(postIds.length, uniquePostIds.length, 'All post_ids should be unique');

        // Check that story with wwwURL is preferred
        const storyWithUrl = /** @type {import('../extensions/types').StoryPost | undefined} */ (result.find(s => s.post_id === '1411731986983785'));
        if (storyWithUrl) {
            assert.ok(storyWithUrl.wwwURL, 'Should prefer story with wwwURL');
        }
    });
});

describe('extractStoryGroupMap', () => {
    it('should extract group from story-user-group.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-user-group.json'), 'utf8'));

        // First extract stories to get the story id
        const stories = extractStories(mockData);
        assert.ok(stories.length > 0, 'Should extract at least one story');

        // Then extract group map
        extractStoryGroupMap(mockData);

        // Find the story
        const story = stories.find(s => s.post_id === '2282323118944469');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 1, 'Story should have 1 attachment');
        assert.strictEqual(story.actors[0].name, 'Kyle Lim', 'Actor name should be Kyle Lim');

        // Get the group for this story
        const group = getGroup(story);
        assert.ok(group, 'Should extract group for the story');
        assert.strictEqual(group.__typename, 'Group');
        assert.strictEqual(group.id, '1250325325477592');
        assert.strictEqual(group.name, 'PS NINTENDO XBOX MALAYSIA CLUB (PNXC)');
    });

    it('should return undefined for story without group', () => {
        // Use story-text-only.json which doesn't have a group
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => s.post_id === '1411731986983785');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 0, 'Story should have 0 attachments');
        assert.strictEqual(story.actors[0].name, '蔡正元', 'Actor name should be 蔡正元');

        const group = getGroup(story);
        assert.strictEqual(group, undefined, 'Text-only story should not have a group');
    });
});

describe('extractStoryCreateTime and getCreateTime', () => {
    it('should extract create time from story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => s.post_id === '1411731986983785');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1765657548 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time from story-attachment-photo.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => s.post_id === '25550089621287122');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1765769968 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time from story-user-group.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-user-group.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => s.post_id === '2282323118944469');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1766143457 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time for main and attached story from story-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        // Main story
        const mainStory = /** @type {StoryPost} */ (stories.find(s => s.post_id === '1414037856753198'));
        assert.ok(mainStory, 'Should find the main story');

        const mainCreateTime = getCreateTime(mainStory);
        assert.ok(mainCreateTime instanceof Date, 'Main story create time should be a Date');
        assert.strictEqual(mainCreateTime.getTime(), 1765933099 * 1000, 'Main story create time should match expected timestamp');

        // Attached story
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        const attachedCreateTime = getCreateTime(mainStory.attached_story);
        assert.ok(attachedCreateTime instanceof Date, 'Attached story create time should be a Date');
        assert.strictEqual(attachedCreateTime.getTime(), 1765843787 * 1000, 'Attached story create time should match expected timestamp');
    });

    it('should return undefined for story without create time data', () => {
        // Create a story object that wasn't extracted from data
        const fakeStory = /** @type {import('../extensions/types').Story} */ ({
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

describe('downloadStory', () => {
    it('should download text-only story from story-text-only.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => s.post_id === '1411731986983785');
        assert.ok(story, 'Should find the story');

        /** @type {Array<{ url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (url, filename) => {
            downloads.push({ url, filename });
        });

        // Text-only story should only have 1 download (the index.md file)
        assert.strictEqual(downloads.length, 1, 'Should have 1 download for text-only story');

        // Check the index.md file
        const indexDownload = downloads[0];
        assert.ok(indexDownload.filename.endsWith('/index.md'), 'Should have index.md file');
        assert.ok(indexDownload.url.startsWith('data:text/markdown;charset=utf-8,'), 'Should be a data URL');

        // Decode and check the markdown content
        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(story)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('蔡正元'), 'Markdown should include the actor name');
        assert.ok(markdownContent.includes('2025-12-13'), 'Markdown should include the date');

        // Check folder name format
        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('2025-12-13'), 'Folder name should include date');
        assert.ok(folderName.includes('蔡正元'), 'Folder name should include actor name');
        assert.ok(folderName.includes('1411731986983785'), 'Folder name should include post_id');
    });

    it('should download story with photo attachments from story-attachment-photo.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-photo.json'), 'utf8'));

        // Setup mock for 4 photos (seed is attachment.media.id)
        const photoIds = ['10236779894211730', '10236779894131728', '10236779894291732', '10236779894371734'];
        setupMockMedia(photoIds);

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => s.post_id === '25550089621287122');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 4, 'Story should have 4 attachments');

        /** @type {Array<{ url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (url, filename) => {
            downloads.push({ url, filename });
        });

        // Should have 5 downloads: 4 photos + 1 index.md
        assert.strictEqual(downloads.length, 5, 'Should have 5 downloads (4 photos + index.md)');

        // Check that 4 photo downloads exist
        const photoDownloads = downloads.filter(d => d.filename.endsWith('.jpg'));
        assert.strictEqual(photoDownloads.length, 4, 'Should have 4 photo downloads');

        // Verify each photo has correct filename format with media id
        for (const photoId of photoIds) {
            const photoDownload = photoDownloads.find(d => d.filename.includes(photoId));
            assert.ok(photoDownload, `Should have download for photo ${photoId}`);
            assert.ok(photoDownload.url.includes(photoId), `URL should contain photo id ${photoId}`);
        }

        // Find the index.md download
        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        // Decode and check the markdown content
        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(story)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('Kimi Cui'), 'Markdown should include the actor name');

        // Markdown should include image references
        assert.ok(markdownContent.includes('!['), 'Markdown should include image references');

        // Check folder name format
        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('Kimi Cui'), 'Folder name should include actor name');
        assert.ok(folderName.includes('25550089621287122'), 'Folder name should include post_id');
    });

    it('should download story with group from story-user-group.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-user-group.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => s.post_id === '2282323118944469');
        assert.ok(story, 'Should find the story');

        /** @type {Array<{ url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (url, filename) => {
            downloads.push({ url, filename });
        });

        // Find the index.md download
        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        // Decode and check the markdown content
        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Markdown should include the group name');
        assert.ok(markdownContent.includes('Kyle Lim'), 'Markdown should include the actor name');

        // Check folder name includes group name
        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Folder name should include group name');
        assert.ok(folderName.includes('Kyle Lim'), 'Folder name should include actor name');
        assert.ok(folderName.includes('2282323118944469'), 'Folder name should include post_id');
    });

    it('should download story with attached story from story-attached-story.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story.json'), 'utf8'));

        // Setup mock for attached story photo
        const attachedPhotoId = '1284281187062002';
        setupMockMedia([attachedPhotoId]);

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = /** @type {StoryPost} */ (stories.find(s => s.post_id === '1414037856753198'));
        assert.ok(story, 'Should find the story');
        assert.ok(story.attached_story, 'Story should have attached_story');
        assert.strictEqual(getAttachmentCount(story), 0, 'Main story should have 0 attachments');
        assert.strictEqual(getAttachmentCount(story.attached_story), 1, 'Attached story should have 1 attachment');

        /** @type {Array<{ url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (url, filename) => {
            downloads.push({ url, filename });
        });

        // Should have 2 downloads: 1 photo from attached_story + index.md
        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 photo + index.md)');

        // Check that attached story photo was downloaded
        const photoDownload = downloads.find(d => d.filename.includes(attachedPhotoId));
        assert.ok(photoDownload, 'Should have download for attached story photo');
        assert.ok(photoDownload.filename.endsWith('.jpg'), 'Photo should have .jpg extension');

        // Find the index.md download
        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        // Decode and check the markdown content
        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes('蔡正元'), 'Markdown should include the main actor name');

        // Check that attached story is rendered as blockquote
        assert.ok(markdownContent.includes('> '), 'Markdown should include blockquoted attached story');
        assert.ok(markdownContent.includes('徐勝凌'), 'Markdown should include the attached story actor name');
    });

    it('should download story with attached story only from story-attached-story-only.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attached-story-only.json'), 'utf8'));

        // Setup mock for attached story photo
        const attachedPhotoId = '1422788539419067';
        setupMockMedia([attachedPhotoId]);

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = /** @type {StoryPost} */ (stories.find(s => s.post_id === '2280345139142267'));
        assert.ok(story, 'Should find the story');
        assert.ok(story.attached_story, 'Story should have attached_story');
        assert.strictEqual(getAttachmentCount(story), 0, 'Main story should have 0 attachments');
        assert.strictEqual(getAttachmentCount(story.attached_story), 1, 'Attached story should have 1 attachment');

        /** @type {Array<{ url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (url, filename) => {
            downloads.push({ url, filename });
        });

        // Should have 2 downloads: 1 photo from attached_story + index.md
        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 photo + index.md)');

        // Check that attached story photo was downloaded
        const photoDownload = downloads.find(d => d.filename.includes(attachedPhotoId));
        assert.ok(photoDownload, 'Should have download for attached story photo');
        assert.ok(photoDownload.filename.endsWith('.jpg'), 'Photo should have .jpg extension');

        // Find the index.md download
        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        // Decode and check the markdown content
        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes('Carol TianTian'), 'Markdown should include the outer story actor name');

        // Check that attached story content is included as blockquote
        assert.ok(markdownContent.includes('> '), 'Markdown should include blockquoted attached story');
        assert.ok(markdownContent.includes('Anime Feels'), 'Markdown should include the attached story actor name');
    });

    it('should download story with video attachment from story-attachment-video.json', async () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'story-attachment-video.json'), 'utf8'));

        // Setup mock for video attachment
        const videoId = '1800120837356279';
        setupMockMedia([videoId], 'Video');

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);
        extractStoryGroupMap(mockData);

        const story = stories.find(s => s.post_id === '2284744602035654');
        assert.ok(story, 'Should find the story');
        assert.strictEqual(getAttachmentCount(story), 1, 'Story should have 1 video attachment');

        /** @type {Array<{ url: string, filename: string }>} */
        const downloads = [];
        await downloadStory(story, (url, filename) => {
            downloads.push({ url, filename });
        });

        // Should have 2 downloads: 1 video + 1 index.md
        assert.strictEqual(downloads.length, 2, 'Should have 2 downloads (1 video + index.md)');

        // Check that video was downloaded
        const videoDownload = downloads.find(d => d.filename.includes(videoId));
        assert.ok(videoDownload, 'Should have download for video');
        assert.ok(videoDownload.filename.endsWith('.mp4'), 'Video should have .mp4 extension');
        assert.ok(videoDownload.url.includes('_hd.mp4'), 'Should prefer HD quality video');

        // Find the index.md download
        const indexDownload = downloads.find(d => d.filename.endsWith('/index.md'));
        assert.ok(indexDownload, 'Should have index.md file');

        // Decode and check the markdown content
        const markdownContent = decodeURIComponent(indexDownload.url.replace('data:text/markdown;charset=utf-8,', ''));
        assert.ok(markdownContent.includes(getStoryUrl(story)), 'Markdown should include the story URL');
        assert.ok(markdownContent.includes('月 影'), 'Markdown should include the actor name');
        assert.ok(markdownContent.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Markdown should include the group name');

        // Check that video is rendered as link (not image)
        assert.ok(markdownContent.includes(`[0001_${videoId}.mp4]`), 'Markdown should include video link');
        assert.ok(!markdownContent.includes(`![0001_${videoId}.mp4]`), 'Video should not be rendered as image');

        // Check folder name format
        const folderName = indexDownload.filename.split('/')[0];
        assert.ok(folderName.includes('月 影'), 'Folder name should include actor name');
        assert.ok(folderName.includes('2284744602035654'), 'Folder name should include post_id');
        assert.ok(folderName.includes('PS NINTENDO XBOX MALAYSIA CLUB'), 'Folder name should include group name');
    });
});
