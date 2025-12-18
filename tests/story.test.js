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

const { isStory, extractStories } = await import('../extensions/story.js');

describe('isStory', () => {
    it('should return false for null', () => {
        assert.strictEqual(isStory(null), false);
    });

    it('should return false for undefined', () => {
        assert.strictEqual(isStory(undefined), false);
    });

    it('should return false for non-object', () => {
        assert.strictEqual(isStory('string'), false);
        assert.strictEqual(isStory(123), false);
    });

    it('should return false for missing id', () => {
        assert.strictEqual(isStory({ post_id: '123', attachments: [] }), false);
    });

    it('should return false for empty id', () => {
        assert.strictEqual(isStory({ id: '', post_id: '123', attachments: [] }), false);
    });

    it('should return false for missing post_id', () => {
        assert.strictEqual(isStory({ id: '123', attachments: [] }), false);
    });

    it('should return false for empty post_id', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '', attachments: [] }), false);
    });

    it('should return false for missing wwwURL', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', attachments: [] }), false);
    });

    it('should return false for empty wwwURL', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', wwwURL: '', attachments: [] }), false);
    });

    it('should return false for missing attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', wwwURL: 'https://www.facebook.com/post/456' }), false);
    });

    it('should return false for non-array attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', wwwURL: 'https://www.facebook.com/post/456', attachments: {} }), false);
    });

    it('should return true for empty attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', wwwURL: 'https://www.facebook.com/post/456', attachments: [] }), true);
    });

    it('should return true for attachments with any content', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            wwwURL: 'https://www.facebook.com/post/456',
            attachments: [{}]
        }), true);
    });
});

describe('extractStories', () => {
    it('should return empty array for null', () => {
        assert.deepStrictEqual(extractStories(null), []);
    });

    it('should return empty array for undefined', () => {
        assert.deepStrictEqual(extractStories(undefined), []);
    });

    it('should return empty array for non-object', () => {
        assert.deepStrictEqual(extractStories('string'), []);
        assert.deepStrictEqual(extractStories(123), []);
    });

    it('should extract a valid story from object', () => {
        const story = {
            id: '123',
            post_id: '456',
            wwwURL: 'https://www.facebook.com/post/456',
            attachments: [{ styles: { attachment: { media: {} } } }]
        };
        const result = extractStories(story);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].id, '123');
    });

    it('should extract story from nested object', () => {
        const obj = {
            data: {
                story: {
                    id: '123',
                    post_id: '456',
                    wwwURL: 'https://www.facebook.com/post/456',
                    attachments: [{ styles: { attachment: { media: {} } } }]
                }
            }
        };
        const result = extractStories(obj);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].id, '123');
    });

    it('should deduplicate stories by id', () => {
        const story = {
            id: '123',
            post_id: '456',
            wwwURL: 'https://www.facebook.com/post/456',
            attachments: [{ styles: { attachment: { media: {} } } }]
        };
        const obj = {
            first: story,
            second: story
        };
        const result = extractStories(obj);
        assert.strictEqual(result.length, 1);
    });

    it('should extract multiple unique stories', () => {
        const obj = {
            first: {
                id: '123',
                post_id: '456',
                wwwURL: 'https://www.facebook.com/post/456',
                attachments: [{ styles: { attachment: { media: {} } } }]
            },
            second: {
                id: '789',
                post_id: '012',
                wwwURL: 'https://www.facebook.com/post/012',
                attachments: [{ styles: { attachment: { all_subattachments: {} } } }]
            }
        };
        const result = extractStories(obj);
        assert.strictEqual(result.length, 2);
    });

    it('should extract stories from array', () => {
        const obj = [
            {
                id: '123',
                post_id: '456',
                wwwURL: 'https://www.facebook.com/post/456',
                attachments: [{ styles: { attachment: { media: {} } } }]
            },
            {
                id: '789',
                post_id: '012',
                wwwURL: 'https://www.facebook.com/post/012',
                attachments: [{ styles: { attachment: { media: {} } } }]
            }
        ];
        const result = extractStories(obj);
        assert.strictEqual(result.length, 2);
    });
});

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
