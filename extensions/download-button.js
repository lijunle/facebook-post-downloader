import { downloadStory, getStoryUrl } from './story.js';
import { React } from './react.js';

const { useEffect } = React;

/**
 * Extract a value from React fiber using an accessor function.
 * @param {Element} element
 * @param {(props: any) => string | undefined} accessor
 * @returns {string | null}
 */
function getValueFromReactFiber(element, accessor) {
    const fiberKey = Object.keys(element || {}).find(k => k.startsWith('__reactFiber$'));
    if (!fiberKey) return null;

    // @ts-ignore - accessing React internals
    let currentFiber = element[fiberKey];
    let visited = 0;

    while (currentFiber && visited < 100) {
        visited++;
        const props = currentFiber.memoizedProps;

        const value = accessor(props);
        if (value) {
            return value;
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
 * Find the button row and insert position for a given action button.
 * Returns null if unable to determine proper position.
 * @param {Element} actionBtn
 * @returns {{ buttonRow: Element, insertBefore: Element | null } | null}
 */
function findButtonRowAndPosition(actionBtn) {
    const ariaLabel = actionBtn.getAttribute('aria-label');

    if (ariaLabel === 'Actions for this post') {
        // Regular feed: button -> parent -> parent = overflowContainer
        // Insert before the overflowContainer in its parent (buttonRow)
        const overflowContainer = actionBtn.parentElement?.parentElement;
        const buttonRow = overflowContainer?.parentElement;
        if (!buttonRow) return null;
        return { buttonRow, insertBefore: overflowContainer };
    }

    if (ariaLabel === 'More') {
        // Watch page: button -> parent = moreButtonWrapper (32x32 container)
        // parent.parent = buttonRow (flex row with user info, post text, More button)
        // Insert before the moreButtonWrapper
        const moreButtonWrapper = actionBtn.parentElement;
        const buttonRow = moreButtonWrapper?.parentElement;
        if (!buttonRow) return null;
        return { buttonRow, insertBefore: moreButtonWrapper };
    }

    return null;
}

/**
 * Inject download buttons into posts that match captured stories.
 * @param {import('./types').Story[]} stories
 * @param {(url: string, filename: string) => void} postAppMessage
 */
function injectDownloadButtons(stories, postAppMessage) {
    // Look for action buttons - "Actions for this post" is used in regular feeds,
    // "More" is used in the Watch (video) page
    const actionButtons = document.querySelectorAll('[aria-label="Actions for this post"], [aria-label="More"]');

    for (const actionBtn of actionButtons) {
        const position = findButtonRowAndPosition(actionBtn);
        if (!position) continue;

        const { buttonRow, insertBefore } = position;
        if (buttonRow.querySelector('.fpdl-download-btn')) continue;

        // Match by story.id
        const storyId = getValueFromReactFiber(actionBtn, p => p?.story?.id);
        let story = storyId ? stories.find(s => s.id === storyId) : null;

        // Fall back to matching by storyPostID
        if (!story) {
            const postId = getValueFromReactFiber(actionBtn, p => p?.storyPostID);
            story = postId ? stories.find(s => s.post_id === postId) : null;
        }

        // Fall back to matching by permalink_url to story URL
        if (!story) {
            const permalinkUrl = getValueFromReactFiber(actionBtn, p => p?.story?.permalink_url);
            story = permalinkUrl ? stories.find(s => getStoryUrl(s) === permalinkUrl) : null;
        }

        if (!story) continue;

        const isWatchPage = actionBtn.getAttribute('aria-label') === 'More';
        const downloadBtn = createDownloadButton(story, postAppMessage);
        if (isWatchPage) {
            downloadBtn.classList.add('fpdl-download-btn--watch');
        }
        if (insertBefore) {
            buttonRow.insertBefore(downloadBtn, insertBefore);
        } else {
            buttonRow.appendChild(downloadBtn);
        }
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
        .fpdl-download-btn--watch,
        .fpdl-download-btn--watch:hover {
            background: transparent;
        }
        .fpdl-download-btn--watch {
            position: relative;
            align-self: flex-start;
            width: 32px;
            height: 32px;
            margin-right: 8px;
        }
        .fpdl-download-btn--watch::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            z-index: -1;
        }
        .fpdl-download-btn--watch:hover::before {
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
