import { useState } from 'react';
import { AlertTriangle, CirclePlay, LoaderCircle, Square, Zap } from 'lucide-react';

import { useGetBoardsQuery } from '../api/boardApi.js';
import {
    useGetSimulationStatusQuery,
    useStartSimulationMutation,
    useStopSimulationMutation,
} from '../api/simulatorApi.js';
import { describeApiFailure, apiErrorMessage } from '../utils/apiError.js';

/**
 * ESP32 MQTT Data Simulator (T-335) - `/simulator`.
 *
 * `docs/simulator-module.md` section 2, built as specified: one white card, a two-column grid
 * of the five fields, the read-only generated-topic preview under the board id, Start/Stop and
 * the running/stopped badge.
 *
 * Two things worth stating, because both are spec rules rather than choices:
 *
 *   1. **This page never talks to MQTT.** It posts the form to Express, which owns the `mqtt`
 *      client (5, first critical rule). The read-only topic preview is composed *here* as well
 *      as on the server purely so it updates as you type - the server rebuilds it and is the
 *      one that publishes.
 *   2. **The topic is not a field.** It is derived from the board id (section 1), which is why
 *      the preview exists at all.
 *
 * Beyond the spec, `GET /api/simulator/status` (T-335) keeps the badge honest across a reload:
 * without it, a page opened while a simulation is running would say "Stopped" and then have its
 * Start refused with a 400. It is read once on mount and invalidated by the two mutations - the
 * badge is event-driven, not polled (Rule 5).
 *
 * That last point is why the reading count appears **only when stopped**: a live counter would
 * have to be polled to stay true, and a number that is reliably wrong is worse than no number.
 *
 * The board id input is a text field as specified, with the registry offered as a `datalist`:
 * a typo would publish to `sensors/<typo>/data`, where Node-RED would happily store a series
 * that no board owns.
 */
const DEFAULTS = {
    // The broker is external (EMQX Serverless) and TLS-only, so the scheme must be
    // mqtts:// for the TLS + credential path in the backend to engage. Overridable at
    // build time (VITE_MQTT_BROKER_URL / VITE_MQTT_PORT) for a different broker.
    brokerUrl:
        import.meta.env.VITE_MQTT_BROKER_URL ?? 'mqtts://n1119107.ala.asia-southeast1.emqxsl.com',
    port: Number(import.meta.env.VITE_MQTT_PORT ?? 8883),
    boardID: 'AA240238',
    sleepTime: 5000,
    condition: 'Safe',
};

/**
 * The failure text for this page.
 *
 * The API's error middleware deliberately replaces the message on any 5xx with
 * "Internal Server Error" so internals are not leaked, and puts the real text in `detail`
 * (outside production). For a development tool whose most likely failure is "the broker is not
 * answering", that detail *is* the answer, so it is preferred when present.
 */
function describeSimulatorFailure(error) {
    const detail = error?.data?.detail;

    if (typeof detail === 'string' && detail.trim() !== '') return detail.trim();

    return describeApiFailure(error, 'Could not start the simulation.');
}

const CONDITIONS = [
    { value: 'Safe', label: 'Safe (pH 7.0-8.0, Turbidity 0-3)' },
    { value: 'Acceptable', label: 'Acceptable (pH 6.5-6.99 / 8.01-8.5, Turbidity 0-5)' },
    { value: 'Unsafe', label: 'Unsafe (pH <6.5 or >8.5, or Turbidity >5)' },
];

export default function Simulator() {
    const [config, setConfig] = useState(DEFAULTS);
    const [feedback, setFeedback] = useState(null);

    const { data: status, isLoading: statusLoading } = useGetSimulationStatusQuery();
    const { data: boardsData } = useGetBoardsQuery({ page: 1, limit: 100 });
    const [startSimulation, { isLoading: isStarting }] = useStartSimulationMutation();
    const [stopSimulation, { isLoading: isStopping }] = useStopSimulationMutation();

    const boards = boardsData?.data ?? [];
    const isRunning = Boolean(status?.running);
    const boardID = String(config.boardID ?? '').trim();
    const generatedTopic = `sensors/${boardID || '<boardID>'}/data`;

    function handleChange(event) {
        const { name, value } = event.target;
        setConfig((previous) => ({ ...previous, [name]: value }));
        // A stale success/error line next to a form that just changed is noise.
        setFeedback(null);
    }

    async function handleStart() {
        setFeedback(null);

        try {
            // Numbers are sent as numbers; the API coerces anyway (Zod), but the payload the
            // network sees should match the contract in 3.3.
            const response = await startSimulation({
                brokerUrl: config.brokerUrl.trim(),
                port: Number(config.port),
                boardID: boardID.toUpperCase(),
                sleepTime: Number(config.sleepTime),
                condition: config.condition,
            }).unwrap();

            setFeedback({ kind: 'ok', text: `${response.message} - publishing to ${response.topic}` });
        } catch (error) {
            setFeedback({ kind: 'error', text: describeSimulatorFailure(error) });
        }
    }

    async function handleStop() {
        setFeedback(null);

        try {
            const response = await stopSimulation().unwrap();
            setFeedback({ kind: 'ok', text: response.message ?? 'Simulation stopped' });
        } catch (error) {
            setFeedback({ kind: 'error', text: describeSimulatorFailure(error) });
        }
    }

    return (
        <div className="min-h-full p-6">
            <header className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">ESP32 MQTT Data Simulator</h2>
                <p className="text-sm text-gray-500">
                    Publish fake board telemetry through the real pipeline, so Node-RED, InfluxDB and
                    the dashboard can be tested without hardware.
                </p>
            </header>

            <div className="rounded-lg bg-white p-6 shadow-sm">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="brokerUrl">
                            MQTT Broker URL
                        </label>
                        <input
                            id="brokerUrl"
                            type="text"
                            name="brokerUrl"
                            value={config.brokerUrl}
                            onChange={handleChange}
                            disabled={isRunning}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="port">
                            MQTT Port
                        </label>
                        <input
                            id="port"
                            type="number"
                            name="port"
                            value={config.port}
                            onChange={handleChange}
                            disabled={isRunning}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="boardID">
                            Board ID
                        </label>
                        <input
                            id="boardID"
                            type="text"
                            name="boardID"
                            value={config.boardID}
                            onChange={handleChange}
                            disabled={isRunning}
                            placeholder="e.g., AA240238"
                            list="simulator-boards"
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {/* Registered boards, offered as suggestions - not a select, because the
                            spec's field is a text input and a simulation may target a board that
                            is not registered yet. */}
                        <datalist id="simulator-boards">
                            {boards.map((board) => (
                                <option key={board.boardId} value={board.boardId}>
                                    {board.locationName}
                                </option>
                            ))}
                        </datalist>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="sleepTime">
                            Sleep Time (ms)
                        </label>
                        <input
                            id="sleepTime"
                            type="number"
                            name="sleepTime"
                            value={config.sleepTime}
                            onChange={handleChange}
                            disabled={isRunning}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        />
                    </div>

                    {/* Auto-generated topic display (2.3) */}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700" htmlFor="generated-topic">
                            Generated Topic (Read-Only)
                        </label>
                        <input
                            id="generated-topic"
                            type="text"
                            value={generatedTopic}
                            readOnly
                            className="mt-1 block w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-sm text-gray-600"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Topic is auto-generated as: sensors/&lt;boardID&gt;/data
                        </p>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700" htmlFor="condition">
                            Target Condition
                        </label>
                        <select
                            id="condition"
                            name="condition"
                            value={config.condition}
                            onChange={handleChange}
                            disabled={isRunning}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        >
                            {CONDITIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-4">
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={isRunning || boardID === '' || isStarting}
                        className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                        {isStarting ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <CirclePlay className="h-4 w-4" aria-hidden="true" />
                        )}
                        Start Simulation
                    </button>

                    <button
                        type="button"
                        onClick={handleStop}
                        disabled={!isRunning || isStopping}
                        className="flex items-center gap-2 rounded-md bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                        {isStopping ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <Square className="h-4 w-4" aria-hidden="true" />
                        )}
                        Stop Simulation
                    </button>
                </div>

                {/* Live status indicator (2.5) */}
                <div className="mt-4" role="status" aria-live="polite">
                    {statusLoading ? (
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-400">
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Checking…
                        </span>
                    ) : isRunning ? (
                        <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-green-600">
                            <span aria-hidden="true">🟢</span>
                            Running (Publishing to
                            <code className="rounded bg-gray-100 px-1">{status.topic}</code>
                            every {status.sleepTime}ms)
                        </span>
                    ) : (
                        <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-500">
                            <span aria-hidden="true">⚪</span>
                            Stopped
                            {/* How many the last run sent - only shown here, where the number is
                                final. While running it would be stale: the status is read on
                                demand, never polled (Rule 5). */}
                            {status?.published > 0 ? (
                                <span className="font-normal text-gray-500">
                                    - the last run sent {status.published} reading
                                    {status.published === 1 ? '' : 's'}
                                </span>
                            ) : null}
                        </span>
                    )}
                </div>

                {status?.lastError && !isRunning ? (
                    <p className="mt-2 flex items-start gap-2 text-xs font-medium text-red-600">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Last run ended with: {apiErrorMessage({ data: { error: status.lastError } })}
                    </p>
                ) : null}

                {feedback ? (
                    <p
                        className={`mt-3 text-sm font-medium ${
                            feedback.kind === 'ok' ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                        {feedback.text}
                    </p>
                ) : null}

                <p className="mt-6 flex items-start gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                    <span>
                        Values follow the target condition, so Node-RED derives the matching{' '}
                        <code className="rounded bg-gray-100 px-1">wq_status</code>. The simulator sends
                        only what a board sends - the derived fields are the flow&apos;s job.
                    </span>
                </p>
            </div>
        </div>
    );
}
