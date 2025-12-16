import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Mock graphql.js before importing story.js
mock.module('../extensions/graphql.js', {
    namedExports: {
        graphqlListener: () => () => { },
        sendGraphqlRequest: async () => [],
    },
});

const { isStory, extractStories } = await import('../extensions/story.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('isStory', () => {
    it('returns false for null', () => {
        assert.strictEqual(isStory(null), false);
    });

    it('returns false for undefined', () => {
        assert.strictEqual(isStory(undefined), false);
    });

    it('returns false for primitive values', () => {
        assert.strictEqual(isStory('string'), false);
        assert.strictEqual(isStory(123), false);
        assert.strictEqual(isStory(true), false);
    });

    it('returns false for object without id', () => {
        assert.strictEqual(isStory({ post_id: '123', attachments: [] }), false);
    });

    it('returns false for object without post_id', () => {
        assert.strictEqual(isStory({ id: '123', attachments: [] }), false);
    });

    it('returns false for object without attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456' }), false);
    });

    it('returns false for object with non-array attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', attachments: {} }), false);
    });

    it('returns true for text-only post (empty attachments)', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: []
        }), true);
    });

    it('returns true for post with media attachment', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{
                styles: {
                    attachment: {
                        media: { id: '789' }
                    }
                }
            }]
        }), true);
    });

    it('returns true for post with all_subattachments', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{
                styles: {
                    attachment: {
                        all_subattachments: { count: 4, nodes: [] }
                    }
                }
            }]
        }), true);
    });

    it('returns false for attachment without styles', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ media: { id: '789' } }]
        }), false);
    });

    it('returns false for attachment without styles.attachment', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ styles: {} }]
        }), false);
    });

    it('returns false for attachment without media or all_subattachments', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ styles: { attachment: {} } }]
        }), false);
    });
});

describe('extractStories', () => {
    it('returns empty array for null', () => {
        const result = extractStories(null);
        assert.deepStrictEqual(result, []);
    });

    it('returns empty array for primitive values', () => {
        assert.deepStrictEqual(extractStories('string'), []);
        assert.deepStrictEqual(extractStories(123), []);
    });

    it('extracts story from top level', () => {
        const story = {
            id: '123',
            post_id: '456',
            attachments: []
        };
        const result = extractStories(story);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].post_id, '456');
    });

    it('extracts story from nested object', () => {
        const data = {
            wrapper: {
                nested: {
                    story: {
                        id: '123',
                        post_id: '456',
                        attachments: []
                    }
                }
            }
        };
        const result = extractStories(data);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].post_id, '456');
    });

    it('extracts story from array', () => {
        const data = [
            { notAStory: true },
            {
                id: '123',
                post_id: '456',
                attachments: []
            }
        ];
        const result = extractStories(data);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].post_id, '456');
    });

    it('deduplicates by post_id', () => {
        const data = {
            story1: {
                id: '111',
                post_id: '456',
                attachments: []
            },
            story2: {
                id: '222',
                post_id: '456',
                attachments: []
            }
        };
        const result = extractStories(data);
        assert.strictEqual(result.length, 1);
    });

    it('prefers story with wwwURL over one without', () => {
        const data = {
            story1: {
                id: '111',
                post_id: '456',
                attachments: []
            },
            story2: {
                id: '222',
                post_id: '456',
                attachments: [],
                wwwURL: 'https://www.facebook.com/test'
            }
        };
        const result = extractStories(data);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].wwwURL, 'https://www.facebook.com/test');
    });

    it('accumulates stories when results array is provided', () => {
        /** @type {import('../extensions/types').Story[]} */
        const existingResults = [{
            id: 'existing',
            post_id: 'existing-id',
            attachments: [],
            wwwURL: 'https://www.facebook.com/existing'
        }];
        const newStory = {
            id: '123',
            post_id: '456',
            attachments: []
        };
        const result = extractStories(newStory, existingResults);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result, existingResults); // Same array reference
    });

    it('extracts multiple different stories', () => {
        const data = {
            stories: [
                { id: '1', post_id: 'a', attachments: [] },
                { id: '2', post_id: 'b', attachments: [] },
                { id: '3', post_id: 'c', attachments: [] }
            ]
        };
        const result = extractStories(data);
        assert.strictEqual(result.length, 3);
    });
});

describe('extractStories with real data', () => {
    it('extracts text-only story from mock-story-text-only.json', () => {
        const filePath = join(__dirname, 'mock-story-text-only.json');
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        const result = extractStories(data);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the text-only story
        const textOnlyStory = result.find(s => s.post_id === '1411731986983785');
        assert.ok(textOnlyStory, 'Should find the text-only story');
        assert.strictEqual(textOnlyStory.attachments.length, 0, 'Text-only story should have empty attachments');
    });

    it('extracts story with attachments from mock-story-with-attachments.json', () => {
        const filePath = join(__dirname, 'mock-story-with-attachments.json');
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        const result = extractStories(data);

        // Should find at least one story
        assert.ok(result.length > 0, 'Should extract at least one story');

        // Find the story with attachments
        const storyWithAttachments = result.find(s => s.post_id === '25550089621287122');
        assert.ok(storyWithAttachments, 'Should find the story with attachments');
        assert.ok(storyWithAttachments.attachments.length > 0, 'Story should have attachments');
    });

    it('deduplicates stories and prefers ones with wwwURL', () => {
        const filePath = join(__dirname, 'mock-story-text-only.json');
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        const result = extractStories(data);

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
