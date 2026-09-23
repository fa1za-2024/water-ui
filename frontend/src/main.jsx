import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { store } from './store/index.js';
import './index.css';

/**
 * React entry point.
 *
 * Extensions are explicit (.jsx/.js) because this is a native-ESM project -
 * that is also why Vite is configured for ESM rather than CRA's implicit
 * resolution.
 */
createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <Provider store={store}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </Provider>
    </React.StrictMode>
);
