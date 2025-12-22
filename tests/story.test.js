import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock graphql.js before importing story.js
mock.module('../extensions/graphql.js', {
    namedExports: {
        getLocation: () => ({
            host: 'www.facebook.com',
            pathname: '/test'
        }),
        graphqlListener: () => { },
        sendGraphqlRequest: () => { }
    }
});

const { extractStories, extractStoryGroupMap, getGroup, extractStoryCreateTime, getCreateTime, getAttachmentCount } = await import('../extensions/story.js');

describe('extractStories with real data', () => {
    it('should extract text-only story from mock-story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the text-only story
        const textOnlyStory = result.find(s => s.post_id === '1411731986983785');
        assert.ok(textOnlyStory, 'Should find the text-only story');
        assert.strictEqual(getAttachmentCount(textOnlyStory), 0, 'Text-only story should have 0 attachments');
        assert.strictEqual(textOnlyStory.actors[0].name, '蔡正元', 'Actor name should be 蔡正元');
    });

    it('should extract story with attachments from mock-story-with-attachments.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attachments.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the story with attachments
        const storyWithAttachments = result.find(s => s.post_id === '25550089621287122');
        assert.ok(storyWithAttachments, 'Should find the story with attachments');
        assert.strictEqual(getAttachmentCount(storyWithAttachments), 4, 'Story should have 4 attachments');
        assert.strictEqual(storyWithAttachments.actors[0].name, 'Kimi Cui', 'Actor name should be Kimi Cui');
    });

    it('should extract story with attached story from mock-story-with-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attached-story.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should extract only 1 story (the main story with attached_story nested inside)
        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        // Should extract the main story
        const mainStory = result.find(s => s.post_id === '1414037856753198');
        assert.ok(mainStory, 'Main story should be extracted');
        assert.strictEqual(getAttachmentCount(mainStory), 0, 'Main story should have 0 attachments');
        assert.strictEqual(mainStory.actors[0].name, '蔡正元', 'Main story actor name should be 蔡正元');

        // Main story should have attached_story
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(mainStory.attached_story.post_id, '1284281217061999', 'Attached story should have correct post_id');
        assert.strictEqual(getAttachmentCount(mainStory.attached_story), 1, 'Attached story should have 1 attachment');
        assert.strictEqual(mainStory.attached_story.actors[0].name, '徐勝凌', 'Attached story actor name should be 徐勝凌');
    });

    it('should extract story with attached story only from mock-story-with-attached-story-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attached-story-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should extract only 1 story
        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        // Should extract the main story (outer story)
        const mainStory = result.find(s => s.post_id === '2280345139142267');
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
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Check that post_ids are unique
        const postIds = result.map(s => s.post_id);
        const uniquePostIds = [...new Set(postIds)];
        assert.strictEqual(postIds.length, uniquePostIds.length, 'All post_ids should be unique');

        // Check that story with wwwURL is preferred
        const storyWithUrl = result.find(s => s.post_id === '1411731986983785');
        if (storyWithUrl) {
            assert.ok(storyWithUrl.wwwURL, 'Should prefer story with wwwURL');
        }
    });
});

describe('extractStoryGroupMap with real data', () => {
    it('should extract group from mock-story-with-group.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-group.json'), 'utf8'));

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
        // Use mock-story-text-only.json which doesn't have a group
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-text-only.json'), 'utf8'));

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

describe('extractStoryCreateTime and getCreateTime with real data', () => {
    it('should extract create time from mock-story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-text-only.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => s.post_id === '1411731986983785');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1765657548 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time from mock-story-with-attachments.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attachments.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => s.post_id === '25550089621287122');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1765769968 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time from mock-story-with-group.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-group.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        const story = stories.find(s => s.post_id === '2282323118944469');
        assert.ok(story, 'Should find the story');

        const createTime = getCreateTime(story);
        assert.ok(createTime instanceof Date, 'Create time should be a Date');
        assert.strictEqual(createTime.getTime(), 1766143457 * 1000, 'Create time should match expected timestamp');
    });

    it('should extract create time for main and attached story from mock-story-with-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attached-story.json'), 'utf8'));

        const stories = extractStories(mockData);
        extractStoryCreateTime(mockData);

        // Main story
        const mainStory = stories.find(s => s.post_id === '1414037856753198');
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