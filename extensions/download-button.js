import { downloadStory } from './story.js';

/**
 * Extract postID from React fiber of a DOM element.
 * @param {Element} element
 * @returns {string | null}
 */
function getPostIdFromReactFiber(element) {
    const fiberKey = Object.keys(element || {}).find(k => k.startsWith('__reactFiber$'));
    if (!fiberKey) return null;

    // @ts-ignore - accessing React internals
    let currentFiber = element[fiberKey];
    let visited = 0;

    while (currentFiber && visited < 50) {
        visited++;
        const props = currentFiber.memoizedProps;

        if (props && typeof props.postID === 'string') {
            return props.postID;
        }

        currentFiber = currentFiber.return;
    }

    return null;
}

/**
 * Create a download button element styled to match Facebook's action buttons.
 * @param {import('./types').Story} story
 * @param {(url: string, filename: string) => void} postAppMessage
 * @returns {HTMLButtonElement}
 */
function createDownloadButton(story, postAppMessage) {
    const btn = document.createElement('button');
    btn.className = 'fpdl-download-btn';
    btn.setAttribute('aria-label', 'Download Facebook post');

    // SVG download icon
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 16l-5-5h3V4h4v7h3l-5 5z"/>
            <path d="M5 18h14v2H5z"/>
        </svg>
    `;

    let downloading = false;
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (downloading) return;
        downloading = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'wait';

        try {
            await downloadStory(story, postAppMessage);
        } catch (err) {
            console.warn('[fpdl] download failed', err);
        } finally {
            downloading = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });

    return btn;
}

/**
 * Inject download buttons into posts that match captured stories.
 * @param {import('./types').Story[]} stories
 * @param {(url: string, filename: string) => void} postAppMessage
 */
function injectDownloadButtons(stories, postAppMessage) {
    const actionButtons = document.querySelectorAll('[aria-label="Actions for this post"]');

    for (const actionBtn of actionButtons) {
        const postContainer = actionBtn.closest('[data-virtualized="false"]');
        if (!postContainer) continue;

        // Skip if already injected
        if (postContainer.querySelector('.fpdl-download-btn')) continue;

        const postId = getPostIdFromReactFiber(postContainer);
        if (!postId) continue;

        const story = stories.find(s => s.post_id === postId);
        if (!story) continue;

        // Find the overflow button container (parent of parent of the "..." button)
        const overflowButtonContainer = actionBtn.parentElement?.parentElement;
        if (!overflowButtonContainer?.parentElement) continue;

        const downloadBtn = createDownloadButton(story, postAppMessage);
        overflowButtonContainer.parentElement.insertBefore(downloadBtn, overflowButtonContainer);
    }
}

/**
 * Inject CSS styles for download buttons.
 */
function injectDownloadButtonStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .fpdl-download-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: transparent;
            color: var(--primary-text);
            cursor: pointer;
            padding: 0;
        }
        .fpdl-download-btn:hover {
            background: var(--hover-overlay);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Set up download button injection with MutationObserver.
 * @param {() => import('./types').Story[]} getStories - Function to get current stories
 * @param {(url: string, filename: string) => void} postAppMessage
 * @returns {() => void} Function to trigger injection (debounced)
 */
export function setupDownloadButtonInjection(getStories, postAppMessage) {
    injectDownloadButtonStyles();

    // Debounce to avoid running too frequently during rapid DOM changes
    let debounceTimer = 0;
    const debouncedInject = () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            injectDownloadButtons(getStories(), postAppMessage);
        }, 100);
    };

    // Use MutationObserver to detect new posts added to the feed
    const observer = new MutationObserver((mutations) => {
        // Only process if mutations might contain new posts
        const hasRelevantChanges = mutations.some(mutation => {
            // Check added nodes for post containers or action buttons
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const el = /** @type {Element} */ (node);
                if (el.matches?.('[data-virtualized="false"]') ||
                    el.querySelector?.('[aria-label="Actions for this post"]')) {
                    return true;
                }
            }
            return false;
        });

        if (hasRelevantChanges) {
            debouncedInject();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    return debouncedInject;
}
