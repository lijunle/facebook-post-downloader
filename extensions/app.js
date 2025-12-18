import { storyListener } from './story.js';
import { React, ReactDOM } from './react.js';
import { StoryTable } from './components.js';

/**
 * @param {string} url
 * @param {string} filename
 */
function postAppMessage(url, filename) {
    window.postMessage({ __fpdl: true, type: "FPDL_DOWNLOAD", url, filename }, window.location.origin);
}

function renderApp() {
    console.log('[FPDL] Rendering React app');

    /** @type {import('./types').Story[]} */
    let stories = [];

    const container = document.createElement('div');
    container.id = 'fpdl-post-table-root';
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    const render = () => {
        root.render(React.createElement(StoryTable, { stories, postAppMessage }));
    };

    storyListener((story) => {
        stories = [...stories, story];
        render();
    });

    render();
}

renderApp();
