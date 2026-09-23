/**
 * Simulator Control Module - the MQTT publishing machinery.
 *
 * One simulation at a time, held in module state (the singleton the spec asks for in 3.1):
 * the controller rejects a second `start` with 400 rather than replacing a running one, so a
 * double click cannot leave an orphaned interval publishing in the background.
 *
 * Deviations from the sample code in `docs/simulator-module.md` 4.1, each for a reason:
 *
 *   1. **A connect timeout.** The sample resolves 200 from inside the client's `connect`
 *      handler and handles only `error`. Against an unreachable broker the connect can hang,
 *      leaving the HTTP request open indefinitely and the UI spinning. `MQTT_CONNECT_TIMEOUT_MS`
 *      bounds it and answers 502 with what to check.
 *   2. **The client is closed on every failure path.** The sample clears the interval on
 *      error but leaves the client open, so a broker that drops mid-run leaks a socket and a
 *      reconnect loop.
 *   3. **`published` and `lastError` are tracked** so `GET /api/simulator/status` can tell the
 *      truth - the spec's status badge has no way to survive a page reload otherwise.
 *   4. **The status topic is mirrored**, exactly as the firmware's Last Will does it: a
 *      retained `online` when publishing begins and `offline` when it stops. The simulator is
 *      supposed to look like a board, and `docs/node-red.md` records that Node-RED does not
 *      consume that topic, so nothing downstream changes.
 *
 * Everything is best-effort on shutdown: `stop` must not throw because the broker went away.
 */
import mqtt, { type MqttClient } from 'mqtt';

import {
    IDLE_SIMULATION_STATUS,
    MQTT_CONNECT_TIMEOUT_MS,
    generateSimulatorPayload,
    simulatorStatusTopic,
    simulatorTopic,
    type SimulationStatus,
    type SimulatorCondition,
    type SimulatorConfig,
} from '../types/simulator';

/** The single live simulation, or null when idle. */
interface ActiveSimulation {
    client: MqttClient;
    /** Null for the moment between registering the simulation and its first interval. */
    timer: NodeJS.Timeout | null;
    topic: string;
    statusTopic: string;
    config: SimulatorConfig;
    startedAt: string;
    published: number;
}

let active: ActiveSimulation | null = null;
let lastError: string | null = null;

/**
 * A summary of the run that ended last.
 *
 * The stop response reports how many readings were sent, and the status badge is the other
 * place an operator looks - so the count is kept here rather than reset to zero. Without it
 * the UI said "Stopped" and nothing else one second after reporting "stopped after 12".
 */
interface FinishedSimulation {
    published: number;
    condition: SimulatorCondition;
    topic: string;
    boardID: string;
    startedAt: string;
    stoppedAt: string;
}

let lastRun: FinishedSimulation | null = null;

/** `mqtt://localhost` + 1883 -> `mqtt://localhost:1883` (section 3.1). */
export function buildBrokerUrl(brokerUrl: string, port: number): string {
    return `${brokerUrl}:${port}`;
}

export function getSimulationStatus(): SimulationStatus {
    if (!active) {
        return {
            ...IDLE_SIMULATION_STATUS,
            lastError,
            ...(lastRun
                ? {
                      published: lastRun.published,
                      condition: lastRun.condition,
                      topic: lastRun.topic,
                      boardID: lastRun.boardID,
                      startedAt: lastRun.startedAt,
                  }
                : {}),
        };
    }

    return {
        running: true,
        topic: active.topic,
        statusTopic: active.statusTopic,
        boardID: active.config.boardID,
        condition: active.config.condition,
        brokerUrl: buildBrokerUrl(active.config.brokerUrl, active.config.port),
        sleepTime: active.config.sleepTime,
        startedAt: active.startedAt,
        published: active.published,
        lastError: null,
    };
}

export class SimulatorUnavailableError extends Error {}

/**
 * Start publishing for `config`.
 *
 * Resolves once the broker has accepted the connection, so the response can report the topic
 * (and the UI never shows "running" for a simulation that never connected).
 */
export async function startSimulation(config: SimulatorConfig): Promise<SimulationStatus> {
    if (active) {
        throw new Error('already-running');
    }

    const topic = simulatorTopic(config.boardID);
    const statusTopic = simulatorStatusTopic(config.boardID);
    const url = buildBrokerUrl(config.brokerUrl, config.port);

    lastError = null;

    const client = mqtt.connect(url, {
        clientId: `water-ui-simulator-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        connectTimeout: MQTT_CONNECT_TIMEOUT_MS,
        // Like the firmware's Last Will: if this process dies, the broker still marks the
        // board offline on the retained status topic.
        will: { topic: statusTopic, payload: 'offline', qos: 0, retain: true },
    });

    await new Promise<void>((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            client.end(true);
            reject(
                new SimulatorUnavailableError(
                    `No answer from the MQTT broker at ${url} within ${MQTT_CONNECT_TIMEOUT_MS} ms. ` +
                        'Check the address and that the broker is running (docker compose up -d mosquitto).'
                )
            );
        }, MQTT_CONNECT_TIMEOUT_MS);

        client.once('connect', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        });

        // Kept alongside the one-shot handler below: an EventEmitter that emits 'error' with
        // no listener throws, and this client can emit more than once (a refused connect
        // followed by a retry). Losing the API to a background reconnect would be absurd.
        client.on('error', () => {});

        client.once('error', (error: Error) => {
            // ECONNREFUSED arrives with an empty `message`, so the reason lives in the code -
            // which mqtt types as a number, hence the cast rather than an intersection type.
            const { code, errno } = error as { code?: string | number; errno?: number };
            const reason =
                error.message || (code !== undefined ? String(code) : '') || (errno !== undefined ? `errno ${errno}` : '') || 'unknown error';
            lastError = reason;
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            client.end(true);
            reject(new SimulatorUnavailableError(`Could not reach the MQTT broker at ${url}: ${reason}`));
        });
    });

    active = {
        client,
        // The interval is created after `active` exists, because it increments its counter.
        timer: null,
        topic,
        statusTopic,
        config,
        startedAt: new Date().toISOString(),
        published: 0,
    };

    // Mirrors the firmware: announce the board as online, retained.
    client.publish(statusTopic, 'online', { retain: true });

    /**
     * One reading. Errors are logged rather than thrown: a broker that disappears mid-run
     * should stop the simulation cleanly, not crash the API.
     */
    const publishOnce = (): void => {
        if (!active) return;

        const payload = generateSimulatorPayload(active.config.boardID, active.config.condition);

        active.client.publish(active.topic, JSON.stringify(payload), { qos: 0 }, (error?: Error) => {
            if (!active) return;

            if (error) {
                lastError = error.message;
                console.error(`[simulator] publish failed: ${error.message}`);
                return;
            }

            active.published += 1;
        });
    };

    // Publish immediately so the pipeline reacts to a click, not to the first interval.
    publishOnce();
    active.timer = setInterval(publishOnce, config.sleepTime);

    client.on('error', (error: Error) => {
        lastError = error.message;
        console.error(`[simulator] MQTT error while running: ${error.message}`);
        void stopSimulation();
    });

    console.log(
        `[simulator] publishing to ${topic} (${config.condition}) every ${config.sleepTime} ms via ${url}`
    );

    return getSimulationStatus();
}

/**
 * Stop publishing and close the client. Safe to call when nothing is running - the sample's
 * `stop` answers 200 either way, and the UI's Stop button should not need to know.
 */
export async function stopSimulation(): Promise<{ stopped: boolean; published: number }> {
    if (!active) {
        return { stopped: false, published: 0 };
    }

    const { client, timer, statusTopic, published, config, topic, startedAt } = active;
    active = null;
    if (timer) clearInterval(timer);

    lastRun = {
        published,
        condition: config.condition,
        topic,
        boardID: config.boardID,
        startedAt,
        stoppedAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve) => {
        // A retained "offline" leaves the status topic truthful, like the device's will.
        try {
            client.publish(statusTopic, 'offline', { retain: true }, () => {
                client.end(false, {}, () => resolve());
            });
        } catch (error) {
            console.error(`[simulator] shutdown publish failed: ${(error as Error).message}`);
            resolve();
        }

        // Do not let a wedged broker hold the HTTP response open.
        setTimeout(resolve, 2_000).unref();
    });

    console.log(`[simulator] stopped after ${published} reading(s)`);

    return { stopped: true, published };
}

/** Used by the tests and by graceful process shutdown. */
export async function stopSimulationOnShutdown(): Promise<void> {
    if (active) {
        await stopSimulation();
    }
}
