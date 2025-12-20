import { downloadStory } from './story.js';
import { React } from './react.js';

const { useEffect } = React;

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
 * Create a debounced version of a function.
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} delay
 * @returns {{ call: T, cancel: () => void }}
 */
function debounce(fn, delay) {
    let timer = 0;
    return {
        call: /** @type {T} */ ((...args) => {
            clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        }),
        cancel: () => clearTimeout(timer),
    };
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
 * @typedef {import('./types').Story} Story
 */

/**
 * React hook to inject download buttons into posts.
 * @param {Story[]} stories
 * @param {(url: string, filename: string) => void} onDownloadFile
 */
export function useDownloadButtonInjection(stories, onDownloadFile) {
    // Inject styles once
    useEffect(() => {
        injectDownloadButtonStyles();
    }, []);

    // Set up observer and inject buttons
    useEffect(() => {
        const { call: inject, cancel } = debounce(
            () => injectDownloadButtons(stories, onDownloadFile),
            100
        );

        const observer = new MutationObserver(inject);
        observer.observe(document.body, { childList: true, subtree: true });

        inject();

        return () => {
            cancel();
            observer.disconnect();
        };
    }, [stories, onDownloadFile]);
}
