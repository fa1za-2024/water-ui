import { apiSlice } from './apiSlice.js';

/**
 * Boards endpoints (T-318/T-319/T-320 - boards module).
 *
 * Every call goes through RTK Query (Rule: no bare fetch in components) and is
 * injected into the shared `apiSlice` rather than a second cache.
 *
 * Contract (MASTER_CONTEXT.md 6.2, verified against the running API):
 *   GET    /api/boards?page=&limit=      -> 200 { data, total, page, limit }  (1-100, default 20, newest first)
 *   POST   /api/boards                   -> 201 { board }        | 400 validation, 409 duplicate id or MAC
 *   GET    /api/boards/:boardID          -> 200 { board }        | 404
 *   PUT    /api/boards/:boardID          -> 200 { board }        | 400, 404, 409   (boardId is immutable)
 *   PATCH  /api/boards/:boardID/status   -> 200 { board }        | 400, 404   (body { isActive }; sets, does not flip)
 *   DELETE /api/boards/:boardID          -> 204 with no body     | 404
 *
 * Every board payload also carries the InfluxDB-derived device status
 * (`lastSeen`, `isOnline`, `wifiStatus`, `battLevel`), which are `null` when InfluxDB
 * could not be read - "unknown", never a false "Offline" (A5).
 */

/** Tag helper: the list plus one tag per board, so a write refreshes only what changed. */
const boardTags = (result) => [
    { type: 'Board', id: 'LIST' },
    ...(result?.data ?? []).map((board) => ({ type: 'Board', id: board.boardId })),
];

export const boardApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getBoards: builder.query({
            // Server-side pagination: the API returns one page plus the total.
            query: ({ page = 1, limit = 20 } = {}) => `/boards?page=${page}&limit=${limit}`,
            providesTags: boardTags,
            /**
             * Re-read when the tab regains focus or the socket reconnects. Both are
             * *events*, not a schedule: Rule 5 forbids polling, and this is the mechanism
             * that makes a page left open overnight correct when someone returns to it.
             * Needs `setupListeners` in the store.
             */
            refetchOnFocus: true,
            refetchOnReconnect: true,
        }),

        getBoard: builder.query({
            query: (boardId) => `/boards/${encodeURIComponent(boardId)}`,
            providesTags: (_result, _error, boardId) => [{ type: 'Board', id: boardId }],
        }),

        createBoard: builder.mutation({
            query: (board) => ({ url: '/boards', method: 'POST', body: board }),
            invalidatesTags: [{ type: 'Board', id: 'LIST' }],
        }),

        updateBoard: builder.mutation({
            // `boardId` is deliberately not accepted: it is the MQTT topic level and the
            // InfluxDB tag, so rewriting it would orphan the board's series (6.2).
            query: ({ boardId, ...changes }) => ({
                url: `/boards/${encodeURIComponent(boardId)}`,
                method: 'PUT',
                body: changes,
            }),
            invalidatesTags: (_result, _error, { boardId }) => [
                { type: 'Board', id: 'LIST' },
                { type: 'Board', id: boardId },
            ],
        }),

        setBoardStatus: builder.mutation({
            // Sets the flag; it does not flip it, so two clicks cannot race each other.
            query: ({ boardId, isActive }) => ({
                url: `/boards/${encodeURIComponent(boardId)}/status`,
                method: 'PATCH',
                body: { isActive },
            }),
            invalidatesTags: (_result, _error, { boardId }) => [
                { type: 'Board', id: 'LIST' },
                { type: 'Board', id: boardId },
            ],
        }),

        deleteBoard: builder.mutation({
            // 204 with no body - nothing to unwrap in the component.
            query: (boardId) => ({ url: `/boards/${encodeURIComponent(boardId)}`, method: 'DELETE' }),
            invalidatesTags: (_result, _error, boardId) => [
                { type: 'Board', id: 'LIST' },
                { type: 'Board', id: boardId },
            ],
        }),
    }),
});

export const {
    useGetBoardsQuery,
    useGetBoardQuery,
    useCreateBoardMutation,
    useUpdateBoardMutation,
    useSetBoardStatusMutation,
    useDeleteBoardMutation,
} = boardApi;
