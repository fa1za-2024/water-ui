import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { io } from 'socket.io-client';

import { apiSlice } from '../api/apiSlice.js';
import { normalizeReading } from '../utils/reading.js';

/**
 * Live board rows for the registry table (T-318).
 *
 * Rule 5: `sensor-update` (Socket.io) -> Redux -> UI. There is **no polling** here and no
 * `setInterval`: the list changes only when the server pushes something.
 *
 * Two steps per pushed reading, in this order:
 *
 *   1. **Patch the cached row** with exactly what the payload carried - the same values the
 *      API stores (`batt_level`, `wifi_status`) plus the reading's time. That is what makes
 *      the table update the instant a board reports, with no request at all.
 *   2. **Coalesce an authoritative refetch.** The patched row is the server's own data
 *      applied locally, but `isOnline` is *derived* (A5's 15-minute window) and must come
 *      from the API - `utils/constants.js` is explicit that the browser never re-derives
 *      it. So the list is invalidated, and RTK Query refetches `GET /api/boards`.
 *
 * A burst of readings would otherwise cause one request each, so step 2 is debounced: the
 * timer is a *coalescer* for pushed events, not a schedule - nothing fires while the
 * sensors are silent. That is the difference between this and polling.
 *
 * `isOnline: true` is set in step 1 only for the board that just delivered a reading, which
 * is the definition of online (its `lastSeen` is inside the window); step 2 confirms it. It
 * is never set back to `false` locally - a board that goes quiet is reported by the API,
 * not guessed at by the browser.
 */

/** How long to wait before re-reading the list after a pushed reading (burst coalescing). */
const REFETCH_COALESCE_MS = 1500;

export function useBoardLiveUpdates(
    listArgs,
    url = import.meta.env.VITE_SOCKET_URL ?? window.location.origin
) {
    const dispatch = useDispatch();
    // Kept in a ref so a new object identity each render cannot tear the socket down.
    const argsRef = useRef(listArgs);
    argsRef.current = listArgs;

    useEffect(() => {
        const socket = io(url, { transports: ['websocket', 'polling'], withCredentials: true });
        let coalesceTimer = null;

        const scheduleRefetch = () => {
            if (coalesceTimer) return;

            coalesceTimer = setTimeout(() => {
                coalesceTimer = null;
                // Refetch the list from the API - the only place `isOnline` comes from.
                dispatch(apiSlice.util.invalidateTags([{ type: 'Board', id: 'LIST' }]));
            }, REFETCH_COALESCE_MS);
        };

        socket.on('sensor-update', (payload) => {
            const reading = normalizeReading(payload);
            if (!reading?.boardId) return;

            dispatch(
                apiSlice.util.updateQueryData('getBoards', argsRef.current, (cached) => {
                    const row = cached?.data?.find((board) => board.boardId === reading.boardId);
                    // Not on this page (or the list is not cached yet): the refetch below
                    // is what brings it in.
                    if (!row) return;

                    if (reading.time) row.lastSeen = reading.time;
                    if (reading.wifiStatus) row.wifiStatus = reading.wifiStatus;
                    if (reading.battLevel) row.battLevel = reading.battLevel;
                    row.isOnline = true;
                })
            );

            scheduleRefetch();
        });

        return () => {
            if (coalesceTimer) clearTimeout(coalesceTimer);
            socket.off('sensor-update');
            socket.disconnect();
        };
    }, [url, dispatch]);
}

export default useBoardLiveUpdates;
