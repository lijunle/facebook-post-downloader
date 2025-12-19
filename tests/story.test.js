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

const { isStory, extractStories, extractStoryGroupMap, getGroup } = await import('../extensions/story.js');

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

describe('extractStoryGroupMap', () => {
    it('should do nothing for null', () => {
        extractStoryGroupMap(null);
        // Should not throw
    });

    it('should do nothing for undefined', () => {
        extractStoryGroupMap(undefined);
        // Should not throw
    });

    it('should do nothing for non-object', () => {
        extractStoryGroupMap('string');
        extractStoryGroupMap(123);
        // Should not throw
    });

    it('should extract group from object with id and to field', () => {
        const obj = {
            id: 'story-123',
            to: {
                __typename: 'Group',
                id: 'group-456',
                name: 'Test Group'
            }
        };
        extractStoryGroupMap(obj);
        const story = /** @type {import('../extensions/types').Story} */ ({ id: 'story-123', post_id: '123', wwwURL: 'url', attachments: [], message: null, attached_story: null });
        const group = getGroup(story);
        assert.ok(group, 'Should extract group');
        assert.strictEqual(group.id, 'group-456');
        assert.strictEqual(group.name, 'Test Group');
    });

    it('should ignore to field without __typename Group', () => {
        const obj = {
            id: 'story-user',
            to: {
                __typename: 'User',
                id: 'user-789',
                name: 'Some User'
            }
        };
        extractStoryGroupMap(obj);
        const story = /** @type {import('../extensions/types').Story} */ ({ id: 'story-user', post_id: '123', wwwURL: 'url', attachments: [], message: null, attached_story: null });
        const group = getGroup(story);
        assert.strictEqual(group, undefined, 'Should not extract non-Group to field');
    });

    it('should ignore to field without name', () => {
        const obj = {
            id: 'story-no-name',
            to: {
                __typename: 'Group',
                id: 'group-no-name'
                // missing name
            }
        };
        extractStoryGroupMap(obj);
        const story = /** @type {import('../extensions/types').Story} */ ({ id: 'story-no-name', post_id: '123', wwwURL: 'url', attachments: [], message: null, attached_story: null });
        const group = getGroup(story);
        assert.strictEqual(group, undefined, 'Should not extract group without name');
    });

    it('should extract group from deeply nested object', () => {
        const obj = {
            data: {
                viewer: {
                    story: {
                        id: 'nested-story',
                        to: {
                            __typename: 'Group',
                            id: 'nested-group',
                            name: 'Nested Group'
                        }
                    }
                }
            }
        };
        extractStoryGroupMap(obj);
        const story = /** @type {import('../extensions/types').Story} */ ({ id: 'nested-story', post_id: '123', wwwURL: 'url', attachments: [], message: null, attached_story: null });
        const group = getGroup(story);
        assert.ok(group, 'Should extract group from nested object');
        assert.strictEqual(group.name, 'Nested Group');
    });

    it('should extract group from array', () => {
        const obj = [
            {
                id: 'array-story-1',
                to: {
                    __typename: 'Group',
                    id: 'array-group-1',
                    name: 'Array Group 1'
                }
            },
            {
                id: 'array-story-2',
                to: {
                    __typename: 'Group',
                    id: 'array-group-2',
                    name: 'Array Group 2'
                }
            }
        ];
        extractStoryGroupMap(obj);
        const story1 = /** @type {import('../extensions/types').Story} */ ({ id: 'array-story-1', post_id: '1', wwwURL: 'url', attachments: [], message: null, attached_story: null });
        const story2 = /** @type {import('../extensions/types').Story} */ ({ id: 'array-story-2', post_id: '2', wwwURL: 'url', attachments: [], message: null, attached_story: null });
        assert.strictEqual(getGroup(story1)?.name, 'Array Group 1');
        assert.strictEqual(getGroup(story2)?.name, 'Array Group 2');
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