// @ts-ignore
await import('../node_modules/umd-react/dist/react.production.min.js');
// @ts-ignore
await import('../node_modules/umd-react/dist/react-dom.production.min.js');

/**
 * @template T
 * @param {() => T | null | undefined} getter
 * @param {number} maxRetries
 * @param {number} delay
 * @returns {Promise<T>}
 */
async function waitFor(getter, maxRetries = 50, delay = 200) {
    for (let i = 0; i < maxRetries; i++) {
        const value = getter();
        if (value) return value;
        await new Promise(r => setTimeout(r, delay));
    }
    throw new Error('waitFor timeout');
}

/** @type {typeof import('react')} */
// @ts-ignore
export const React = await waitFor(() => require('React'));

/** @type {typeof import('react-dom/client')} */
// @ts-ignore
export const ReactDOM = await waitFor(() => require('ReactDOM'));
