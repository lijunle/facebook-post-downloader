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

const { extractStories, extractStoryGroupMap, getGroup } = await import('../extensions/story.js');

describe('extractStories with real data', () => {
    it('should extract text-only story from mock-story-text-only.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-text-only.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the text-only story
        const textOnlyStory = result.find(s => s.post_id === '1411731986983785');
        assert.ok(textOnlyStory, 'Should find the text-only story');
        assert.strictEqual(textOnlyStory.attachments.length, 0, 'Text-only story should have empty attachments');
    });

    it('should extract story with attachments from mock-story-with-attachments.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attachments.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the story with attachments
        const storyWithAttachments = result.find(s => s.post_id === '25550089621287122');
        assert.ok(storyWithAttachments, 'Should find the story with attachments');
        assert.ok(storyWithAttachments.attachments.length > 0, 'Story should have attachments');
    });

    it('should extract story with attached story from mock-story-with-attached-story.json', () => {
        const mockData = JSON.parse(readFileSync(join(__dirname, 'mock-story-with-attached-story.json'), 'utf8'));
        const result = extractStories(mockData);

        // Should extract only 1 story (the main story with attached_story nested inside)
        assert.strictEqual(result.length, 1, 'Should extract exactly 1 story');

        // Should extract the main story
        const mainStory = result.find(s => s.post_id === '1414037856753198');
        assert.ok(mainStory, 'Main story should be extracted');

        // Main story should have attached_story
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(mainStory.attached_story.post_id, '1284281217061999', 'Attached story should have correct post_id');
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
        assert.strictEqual(mainStory.attachments.length, 0, 'Outer story should have no attachments');

        // Main story should have attached_story with the substory
        assert.ok(mainStory.attached_story, 'Main story should have attached_story');
        assert.strictEqual(mainStory.attached_story.post_id, '1422788562752398', 'Attached story should have correct post_id');

        // Inner story (attached_story) has message and attachments
        assert.ok(mainStory.attached_story.message, 'Attached story should have message');
        assert.ok(mainStory.attached_story.message.text, 'Attached story message should have text');
        assert.ok(mainStory.attached_story.attachments.length > 0, 'Attached story should have attachments');
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

        const group = getGroup(story);
        assert.strictEqual(group, undefined, 'Text-only story should not have a group');
    });
});