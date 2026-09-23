import { apiSlice } from './apiSlice.js';

/**
 * Dashboard endpoints (T-302 / section 6.3, A28).
 *
 * Rule: RTK Query for ALL calls - the dashboard never touches fetch/axios, so caching,
 * invalidation and the loading/error flags come from one place.
 *
 * Contract (verified against the running API):
 *   GET /api/dashboard/summary                  -> 200 { generatedAt, onlineWindowMinutes,
 *                                                        influxAvailable, boards, waterStatus }
 *   GET /api/dashboard/boards-locations         -> 200 { influxAvailable, count, data[] }
 *   GET /api/dashboard/latest/:boardID          -> 200 { influxAvailable, board, reading }
 *
 * Two rules these responses carry and the UI must honour (A28):
 *
 *   1. **Active boards only.** Every count and every marker already excludes
 *      `is_active = false`, and `boards.total/active/inactive` is there so the exclusion
 *      can be shown rather than merely trusted.
 *   2. **Degrade to `null`, never `0`.** When InfluxDB cannot be read every
 *      InfluxDB-derived number is `null` with `influxAvailable: false`; rendering that as
 *      "0 online, 0 unsafe" would read as a confident all-clear. The components print "—".
 */

/** One tag for the whole dashboard, so a single socket event can refresh all of it. */
const DASHBOARD_TAG = 'DashboardSummary';

export const dashboardApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getDashboardSummary: builder.query({
            query: () => '/dashboard/summary',
            providesTags: [DASHBOARD_TAG],
        }),

        getBoardLocations: builder.query({
            // Markers for the ACTIVE boards only; coordinates are JSON numbers (T-227).
            query: () => '/dashboard/boards-locations',
            providesTags: [DASHBOARD_TAG],
        }),

        getLatestReading: builder.query({
            query: (boardId) => `/dashboard/latest/${encodeURIComponent(boardId)}`,
            // Tagged with the board as well, so the boards module's writes refresh it too.
            providesTags: (_result, _error, boardId) => [DASHBOARD_TAG, { type: 'Board', id: boardId }],
        }),
    }),
});

export const {
    useGetDashboardSummaryQuery,
    useGetBoardLocationsQuery,
    useGetLatestReadingQuery,
} = dashboardApi;
