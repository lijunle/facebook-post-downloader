import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

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

    it('should return false for missing attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456' }), false);
    });

    it('should return false for non-array attachments', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', attachments: {} }), false);
    });

    it('should return false for empty attachments without message.text', () => {
        assert.strictEqual(isStory({ id: '123', post_id: '456', attachments: [] }), false);
    });

    it('should return false for empty attachments with message but no text', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [],
            message: { __typename: 'TextWithEntities' }
        }), false);
    });

    it('should return false for empty attachments with empty text', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [],
            message: { text: '' }
        }), false);
    });

    it('should return true for empty attachments with message.text', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [],
            message: { text: 'Hello world' }
        }), true);
    });

    it('should return false for attachment without styles', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{}]
        }), false);
    });

    it('should return false for attachment without styles.attachment', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ styles: {} }]
        }), false);
    });

    it('should return false for attachment without media or all_subattachments', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ styles: { attachment: {} } }]
        }), false);
    });

    it('should return true for attachment with media', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ styles: { attachment: { media: {} } } }]
        }), true);
    });

    it('should return true for attachment with all_subattachments', () => {
        assert.strictEqual(isStory({
            id: '123',
            post_id: '456',
            attachments: [{ styles: { attachment: { all_subattachments: {} } } }]
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
                attachments: [{ styles: { attachment: { media: {} } } }]
            },
            second: {
                id: '789',
                post_id: '012',
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
                attachments: [{ styles: { attachment: { media: {} } } }]
            },
            {
                id: '789',
                post_id: '012',
                attachments: [{ styles: { attachment: { media: {} } } }]
            }
        ];
        const result = extractStories(obj);
        assert.strictEqual(result.length, 2);
    });
});
