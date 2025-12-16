// @ts-ignore
await import('../node_modules/umd-react/dist/react.production.min.js');
// @ts-ignore
await import('../node_modules/umd-react/dist/react-dom.production.min.js');

/** @type {typeof import('react')} */
// @ts-ignore
const React = require('React');
/** @type {typeof import('react-dom/client')} */
// @ts-ignore
const ReactDOM = require('ReactDOM');

export function renderApp() {
    console.log('Rendering app.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    ReactDOM.createRoot(container).render(React.createElement('div', null, 'Hello from app.js'));
}
