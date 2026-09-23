import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * Base RTK Query API slice.
 *
 * MASTER_CONTEXT.md Rule: RTK Query must be used for ALL API calls and caching.
 * Do not add axios/fetch calls in components - inject endpoints into this slice
 * from the per-module files (authApi.js, boardApi.js, dashboardApi.js) with
 * `apiSlice.injectEndpoints()`. A `historicalApi.js` was written for the dashboard's chart,
 * which the user removed (T-331); its endpoints return with the Historical page (T-321).
 *
 * The base URL is intentionally RELATIVE: in development Vite proxies /api,
 * and in production nginx does. That keeps the browser same-origin, so there is
 * no CORS surface and no hard-coded host.
 */
export const apiSlice = createApi({
    reducerPath: 'api',
    baseQuery: fetchBaseQuery({
        baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
        prepareHeaders: (headers, { getState }) => {
            const token = getState().auth?.token;
            if (token) {
                headers.set('authorization', `Bearer ${token}`);
            }
            return headers;
        },
    }),

    // Tag types used by the injected endpoint definitions for cache invalidation.
    tagTypes: ['User', 'Board', 'DashboardSummary', 'Historical', 'Simulator'],

    // Endpoints are injected by the module slices, so start empty.
    endpoints: () => ({}),
});
