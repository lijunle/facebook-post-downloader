import { storyListener, fetchAllAttachments } from './story.js';

console.log('[FPDL] GraphQL patch applied');

storyListener((/** @type {import('./types').Story} */ story) => {
    console.log(`[FPDL] Captured story:`, story);
});

// @ts-ignore
window.__fetchAllAttachments = fetchAllAttachments;
