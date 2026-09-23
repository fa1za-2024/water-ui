/**
 * Simulator Control Module - types, bounds and payload generation.
 *
 * Source of truth: `docs/simulator-module.md` (3.2 for the bounds, 3.3 for the wire
 * shapes). The module lets a developer drive the IoT pipeline from the UI: Express
 * publishes to the broker exactly what a board would send, so Node-RED -> InfluxDB ->
 * the dashboard can be exercised without hardware.
 *
 * Two things this module deliberately does **not** do:
 *
 *   1. It never publishes `wq_status` / `batt_level` / `wifi_status`. Node-RED derives
 *      those from the raw values (MASTER_CONTEXT.md 5.3 is their single source of truth),
 *      so sending them would be impersonating the server - and could contradict it.
 *   2. It never lets the browser choose a topic. The topic is composed here from the board
 *      id, which is why an invalid id is rejected rather than pasted into a topic string.
 *
 * The payload therefore matches `iot/esp32c3/water_quality_mqtt.ino` field for field, and
 * the condition bounds are coupled to the flow's thresholds on purpose: a reading generated
 * for `Unsafe` must be *classified* Unsafe, which is the only reason to have the control.
 */
import { BOARD_ID_PATTERN } from './board';

export const SIMULATOR_CONDITIONS = ['Safe', 'Acceptable', 'Unsafe'] as const;

export type SimulatorCondition = (typeof SIMULATOR_CONDITIONS)[number];

/**
 * What the hardware sends (section 5.1). `ts` is epoch **milliseconds**; Node-RED stores it
 * as the point's `_time` when it is present, otherwise it uses the arrival time.
 */
export interface SimulatorPayload {
    boardID: string;
    pH: number;
    turbidity: number;
    batt_voltage: number;
    rssi: number;
    ts: number;
}

/** The form's fields (section 2.2), with the documented defaults. */
export interface SimulatorConfig {
    brokerUrl: string;
    port: number;
    boardID: string;
    sleepTime: number;
    condition: SimulatorCondition;
}

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
    brokerUrl: 'mqtt://localhost',
    port: 1883,
    boardID: 'AA240238',
    sleepTime: 5000,
    condition: 'Safe',
};

/** `sleepTime` guards - a 0 ms interval would flood the broker and the flow. */
export const MIN_SLEEP_MS = 100;
export const MAX_SLEEP_MS = 600_000;

/**
 * How long to wait for the broker before giving up on `start`.
 *
 * The spec's sample code waits for the client's `connect` event and never handles "it
 * never connects", which leaves the HTTP request hanging forever. Bounded here instead.
 */
export const MQTT_CONNECT_TIMEOUT_MS = 5_000;

/** The topic rule (section 1): auto-generated, never typed by the user. */
export function simulatorTopic(boardID: string): string {
    return `sensors/${boardID}/data`;
}

/** The status topic the firmware also uses (retained `online` / `offline`). */
export function simulatorStatusTopic(boardID: string): string {
    return `sensors/${boardID}/status`;
}

/** The current state of the one allowed simulation, for the UI badge (and GET status). */
export interface SimulationStatus {
    running: boolean;
    topic: string | null;
    statusTopic: string | null;
    boardID: string | null;
    condition: SimulatorCondition | null;
    brokerUrl: string | null;
    sleepTime: number | null;
    startedAt: string | null;
    published: number;
    /** Why the last run ended, when it ended badly - so a failed start is visible. */
    lastError: string | null;
}

export const IDLE_SIMULATION_STATUS: SimulationStatus = {
    running: false,
    topic: null,
    statusTopic: null,
    boardID: null,
    condition: null,
    brokerUrl: null,
    sleepTime: null,
    startedAt: null,
    published: 0,
    lastError: null,
};

/** Two decimals, like the firmware's `%.2f` - no floating-point tails on the wire. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

const randomInRange = (min: number, max: number): number => round2(Math.random() * (max - min) + min);

/** Integer in [min, max] inclusive. */
const randomInt = (min: number, max: number): number => Math.floor(min + Math.random() * (max - min + 1));

/**
 * Build one reading for `boardID` that satisfies `condition` (section 3.2).
 *
 * The bounds are chosen so the flow's own thresholds (`iot/node-red/flows.json`: pH
 * 6.5 / 7.0 / 8.0 / 8.5, turbidity 3.0 / 5.0) derive the status the developer asked for. If
 * those thresholds ever change, these bounds have to move with them.
 */
export function generateSimulatorPayload(boardID: string, condition: SimulatorCondition): SimulatorPayload {
    let pH: number;
    let turbidity: number;

    if (condition === 'Safe') {
        pH = randomInRange(7.0, 8.0);
        turbidity = randomInRange(0.0, 3.0);
    } else if (condition === 'Acceptable') {
        pH = Math.random() > 0.5 ? randomInRange(6.5, 6.99) : randomInRange(8.01, 8.5);
        turbidity = randomInRange(0.0, 5.0);
    } else if (Math.random() < 0.5) {
        // Unsafe by pH: the reading is extreme while turbidity stays legal.
        pH = Math.random() > 0.5 ? randomInRange(0.0, 6.49) : randomInRange(8.51, 14.0);
        turbidity = randomInRange(0.0, 5.0);
    } else {
        // Unsafe by turbidity: high NTU at a normal pH.
        pH = randomInRange(7.0, 8.0);
        turbidity = randomInRange(5.1, 1000.0);
    }

    return {
        boardID,
        pH,
        turbidity,
        // Voltage and signal describe the device, not the water, so they vary regardless.
        batt_voltage: randomInRange(3.0, 4.2),
        rssi: randomInt(-100, -30),
        ts: Date.now(),
    };
}

/** Shared with the API's board validation, so a simulated id is a valid board id. */
export { BOARD_ID_PATTERN };
