import { createSlice } from '@reduxjs/toolkit';

/**
 * Live sensor state.
 *
 * The `sensor-update` Socket.io event lands here (see src/hooks/useSocket.js),
 * and the dashboard components read it with the selectors below. This is the
 * only path live data takes - there is no polling (Rule 5).
 *
 * `wq_status` values written by Node-RED are 'Safe' | 'Acceptable' | 'Unsafe'.
 * The UI shows 'Not Safe' for 'Unsafe' (Rule 2) - do the mapping at render
 * time, never store the display string.
 */
const initialState = {
    /** Most recent reading, regardless of board. */
    latest: null,
    /** Most recent reading keyed by boardID, for the map markers. */
    byBoard: {},
    /** Socket.io connection state, so the UI can show a stale-data warning. */
    connected: false,
    /** Simple counter used to trigger re-renders/flash effects. */
    receivedCount: 0,
};

const sensorSlice = createSlice({
    name: 'sensor',
    initialState,
    reducers: {
        sensorUpdateReceived(state, action) {
            const reading = action.payload;
            if (!reading || typeof reading !== 'object') return;

            state.latest = reading;
            state.receivedCount += 1;

            if (reading.boardID) {
                state.byBoard[reading.boardID] = reading;
            }
        },

        setConnected(state, action) {
            state.connected = Boolean(action.payload);
        },

        resetSensorState() {
            return initialState;
        },
    },
});

export const { sensorUpdateReceived, setConnected, resetSensorState } = sensorSlice.actions;

// --- Selectors --------------------------------------------------------------
export const selectLatestReading = (state) => state.sensor.latest;
export const selectReadingsByBoard = (state) => state.sensor.byBoard;
export const selectConnectionState = (state) => state.sensor.connected;
export const selectBoardReading = (boardId) => (state) => state.sensor.byBoard[boardId] ?? null;

/**
 * How many `sensor-update` events have arrived.
 *
 * This is the counter the dashboard keys its "a reading arrived, refresh the aggregates"
 * effect on. Keying on the *count* rather than on `latest` matters: two readings from the
 * same board in a row produce two new objects with nothing to tell them apart, and an
 * effect keyed on the object would still fire - but a board that reports the identical
 * payload twice would look like no change if the effect compared values.
 */
export const selectReceivedCount = (state) => state.sensor.receivedCount;

export default sensorSlice.reducer;
