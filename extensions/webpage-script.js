import { renderApp } from './app.js';
import { storyListener, fetchAllAttachments } from './story.js';

console.log('[FPDL] GraphQL patch applied');

// @ts-ignore
const posts = window.__fpdl_posts = [];
storyListener((/** @type {import('./types').Story} */ story) => {
    const attachment = story.attachments[0]?.styles.attachment;
    const attachmentInfo = attachment
        ? ('media' in attachment
            ? { totalCount: 1, nodes: [attachment.media] }
            : { totalCount: attachment.all_subattachments.count, nodes: attachment.all_subattachments.nodes.map(n => n.media) })
        : { totalCount: 0, nodes: [] };

    posts.push({
        id: story.id,
        post_id: story.post_id,
        text: story.message.text,
        attachmentsTotalCount: attachmentInfo.totalCount,
        attachments: attachmentInfo.nodes,
        story,
    });
});

// @ts-ignore
window.__fpdl_retrieveAttachments = async (/** @type {{ story: import('./types').Story }} */ { story }) => {
    const attachments = await fetchAllAttachments(story);
    const post = posts.find(p => p.id === story.id);
    if (post) {
        post.attachments = attachments;
    }
};

renderApp();
