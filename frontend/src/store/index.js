import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { apiSlice } from '../api/apiSlice.js';
import authReducer from './slices/authSlice.js';
import sensorReducer from './slices/sensorSlice.js';

/**
 * Redux Toolkit store.
 *
 * Two kinds of state, deliberately separated:
 *   - `api`    : RTK Query cache - everything fetched over HTTP
 *   - `sensor` : live readings pushed over Socket.io (Rule 5)
 *   - `auth`   : the single user's token/profile
 */
export const store = configureStore({
    reducer: {
        [apiSlice.reducerPath]: apiSlice.reducer,
        auth: authReducer,
        sensor: sensorReducer,
    },

    // Required for RTK Query's caching, invalidation and polling lifecycle.
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
});

/**
 * Enables the event-driven revalidation an endpoint can opt into with `refetchOnFocus` /
 * `refetchOnReconnect` (the boards list does). Neither is polling: they fire on a real
 * browser event, which is what Rule 5 asks for.
 */
setupListeners(store.dispatch);

export default store;
