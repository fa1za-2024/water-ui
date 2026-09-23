import { apiSlice } from './apiSlice.js';

/**
 * Historical endpoints (T-321/T-322/T-323 - section 6.4, A27).
 *
 * Every call goes through RTK Query, so the auth header, caching and the loading/error
 * flags come from `apiSlice` - the export included, which is why the download is a
 * **mutation with a blob response**: the file is streamed by Express (Rule 3, `exceljs`)
 * and cannot be fetched with a plain `<a href>` because the route requires the Bearer
 * token that lives in the store.
 *
 * Contract (verified against the running API):
 *   GET /api/historical/:boardID?range=…             -> 200 { range, boards: [{ boardId, points }] }
 *   GET /api/historical?boardIDs=A,B&range=…         -> 200 { range, boards }        (overlay, T-217)
 *   GET /api/historical/:boardID/readings?…&page=&limit= -> 200 { data, total, page, limit, range }
 *   GET /api/historical/export/excel/:boardID?range=… -> 200 `.xlsx` stream
 *
 * `range` is one of `1h` / `24h` / `1d` / `7d` / `1w` / `1m` (the two pairs are aliases), or
 * a `start` + `end` pair instead - mutually exclusive, and a span longer than the 30-day
 * retention is rejected rather than truncated. Every timestamp is ISO-8601 **UTC**; the UI
 * formats it with Day.js (Rule 7).
 */

/** Only send a range when there is no custom window (the API treats them as either/or). */
function windowParams({ range, start, end }) {
    if (start && end) return { start, end };

    return range ? { range } : {};
}

export const historicalApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        /** Downsampled series for the chart (one point per aggregate window, `null` when empty). */
        getSeries: builder.query({
            query: ({ boardId, ...window }) => ({
                url: `/historical/${encodeURIComponent(boardId)}`,
                params: windowParams(window),
            }),
            providesTags: (_result, _error, { boardId }) => [{ type: 'Historical', id: boardId }],
        }),

        /** Several boards overlaid on one chart (up to 5, aligned window by window). */
        getMultiSeries: builder.query({
            query: ({ boardIds, ...window }) => ({
                url: '/historical',
                params: { boardIDs: boardIds.join(','), ...windowParams(window) },
            }),
            providesTags: ['Historical'],
        }),

        /** One page of stored readings for the table. */
        getReadings: builder.query({
            query: ({ boardId, page = 1, limit = 20, ...window }) => ({
                url: `/historical/${encodeURIComponent(boardId)}/readings`,
                params: { page, limit, ...windowParams(window) },
            }),
            providesTags: (_result, _error, { boardId }) => [{ type: 'Historical', id: boardId }],
        }),

        /**
         * The `.xlsx` download.
         *
         * A mutation (not a query) because it is a one-shot side effect: caching a workbook
         * blob would serve a stale file, and the button is pressed to get *this* window
         * *now*. The custom `responseHandler` returns the blob **plus the filename the API
         * chose** (`Content-Disposition: attachment; filename="water-quality-…xlsx"`), so the
         * browser saves exactly what the server called it instead of a name we invented.
         */
        exportReadings: builder.mutation({
            query: ({ boardId, ...window }) => ({
                url: `/historical/export/excel/${encodeURIComponent(boardId)}`,
                params: windowParams(window),
                responseHandler: async (response) => {
                    if (!response.ok) {
                        // Keep the error path identical to every other endpoint: the caller
                        // reads `{ error }` out of `data`.
                        const body = await response.json().catch(() => null);
                        const error = new Error('Export failed');
                        error.status = response.status;
                        error.data = body;

                        throw error;
                    }

                    const disposition = response.headers.get('content-disposition') ?? '';
                    const match = /filename="?([^";]+)"?/i.exec(disposition);

                    return { blob: await response.blob(), filename: match?.[1] ?? null };
                },
            }),
            // Nothing about a board's data changed, so no tag is invalidated.
        }),
    }),
});

export const {
    useGetSeriesQuery,
    useGetMultiSeriesQuery,
    useGetReadingsQuery,
    useExportReadingsMutation,
} = historicalApi;
