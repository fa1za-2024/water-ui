import { apiSlice } from './apiSlice.js';

/**
 * Simulator endpoints (T-335 - docs/simulator-module.md 3.3).
 *
 *   POST /api/simulator/start   -> 200 { message, topic, condition, boardID, sleepTime, brokerUrl }
 *   POST /api/simulator/stop    -> 200 { message, stopped, published }
 *   GET  /api/simulator/status  -> 200 { running, topic, condition, published, lastError, ... }
 *
 * **The browser never speaks MQTT.** The spec's critical rule: the publish happens in Express
 * (services/simulatorService.ts), and these three calls are the only way to reach it. That is
 * also why the page cannot offer a "test connection" that bypasses the backend.
 *
 * `getSimulationStatus` exists because of section 2.5's status badge: without it a page that
 * has just been reloaded would claim "Stopped" while a simulation was still publishing, and
 * the next Start would be refused with a 400. It is a **one-shot read** (mount + after each
 * mutation), never a poll - Rule 5.
 */
export const simulatorApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        getSimulationStatus: builder.query({
            query: () => '/simulator/status',
            providesTags: ['Simulator'],
        }),

        startSimulation: builder.mutation({
            query: (config) => ({
                url: '/simulator/start',
                method: 'POST',
                body: config,
            }),
            // The backend's own state changed, so re-read it rather than guessing locally.
            invalidatesTags: ['Simulator'],
        }),

        stopSimulation: builder.mutation({
            query: () => ({ url: '/simulator/stop', method: 'POST' }),
            invalidatesTags: ['Simulator'],
        }),
    }),
});

export const {
    useGetSimulationStatusQuery,
    useStartSimulationMutation,
    useStopSimulationMutation,
} = simulatorApi;
