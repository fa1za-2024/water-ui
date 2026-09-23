#!/usr/bin/env node
/**
 * ============================================================================
 * Water UI - standalone ESP32 (XIAO ESP32C3) MQTT simulator
 * ============================================================================
 *
 * Publishes the same JSON telemetry a real board sends, so the whole pipeline can
 * be exercised without hardware:
 *
 *   this script --MQTT(sensors/<boardID>/data)--> Mosquitto --> Node-RED --> InfluxDB
 *                                                                        \-> Express -> UI
 *
 * Why a separate file when `docs/simulator-module.md` specifies a UI module? That
 * module drives the same publishing from the Express backend so a developer can
 * click "Start" in the browser - but it needs the API, the frontend and a signed-in
 * session. This script is the terminal equivalent: one command, no stack, no build,
 * which is what you want for a quick check, a demo, or scripted verification.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   cd iot/simulator
 *   npm install                       # once - the only dependency is `mqtt`
 *
 *   node simulate-esp32.js                                  # Safe, every 5s, forever
 *   node simulate-esp32.js --condition Unsafe                # extreme readings
 *   node simulate-esp32.js --board PAGOH1 --interval 1000    # a second board, fast
 *   node simulate-esp32.js --count 3 --interval 300          # publish 3, then exit
 *   node simulate-esp32.js --dry-run --count 2               # print payloads, no broker
 *   node simulate-esp32.js --help
 *
 * Ctrl+C stops it and (like the firmware's Last Will) marks the board offline.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRACT THIS HONOURS (iot/esp32c3/water_quality_mqtt.ino is the source)
 * ---------------------------------------------------------------------------
 *   topic    sensors/<boardID>/data        built from the board id, never typed
 *   payload  {"boardID":"AA240238","pH":7.12,"turbidity":1.23,
 *             "batt_voltage":3.95,"rssi":-62,"ts":1696000000000}
 *            - pH / turbidity / batt_voltage rounded to 2 decimals, rssi an int,
 *              ts in epoch **milliseconds** (`Date.now()`).
 *   status   sensors/<boardID>/status      retained "online" on connect, "offline"
 *                                          on exit AND on a crash (MQTT will).
 *   qos      0 (PubSubClient cannot publish anything else - see docs/mqtt-topics.md)
 *
 * It deliberately does **not** send `wq_status` / `batt_level` / `wifi_status`:
 * those are derived by Node-RED from pH, turbidity, voltage and RSSI
 * (MASTER_CONTEXT.md 5.3, the single source of truth for the thresholds). Sending
 * them would be pretending to be the server and could disagree with the flow.
 *
 * The generated values follow `docs/simulator-module.md` 3.2 exactly, so each
 * condition lands in the status the flow will derive for it.
 * ============================================================================
 */

import mqtt from 'mqtt';
import process from 'node:process';

// --- Defaults, matching docs/simulator-module.md 2.2 ------------------------
const DEFAULTS = {
    broker: 'mqtt://localhost',
    port: 1883,
    boardID: 'AA240238',
    intervalMs: 5000,
    condition: 'Safe',
    count: 0, // 0 = run until Ctrl+C
};

/** The three conditions the UI offers, and therefore the three this accepts. */
const CONDITIONS = ['Safe', 'Acceptable', 'Unsafe'];

/** The same rule the API enforces on `boardId` (backend/src/types/board.ts). */
const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

const HELP = `
Water UI - ESP32 MQTT data simulator

Usage: node simulate-esp32.js [options]

Options:
  --broker <url>       Broker address without port      (default ${DEFAULTS.broker})
  --port <n>           Broker port                      (default ${DEFAULTS.port})
  --board <id>         Board id -> sensors/<id>/data    (default ${DEFAULTS.boardID})
  --condition <name>   ${CONDITIONS.join(' | ')}
                                                        (default ${DEFAULTS.condition})
  --interval <ms>      Delay between readings           (default ${DEFAULTS.intervalMs})
  --count <n>          Publish n readings then exit     (default: until Ctrl+C)
  --dry-run            Print the payloads without connecting to a broker
  --quiet              Only warnings and the final summary
  --help               Show this message

Examples:
  node simulate-esp32.js --condition Unsafe --interval 1000
  node simulate-esp32.js --board PAGOH2 --count 5
`.trim();

// --- Argument parsing -------------------------------------------------------
function parseArgs(argv) {
    const options = { ...DEFAULTS };

    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const value = argv[index + 1];

        switch (flag) {
            case '--broker':
                options.broker = value;
                index += 1;
                break;
            case '--port':
                options.port = Number(value);
                index += 1;
                break;
            case '--board':
                options.boardID = value;
                index += 1;
                break;
            case '--condition':
                options.condition = value;
                index += 1;
                break;
            case '--interval':
                options.intervalMs = Number(value);
                index += 1;
                break;
            case '--count':
                options.count = Number(value);
                index += 1;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--quiet':
                options.quiet = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                fail(`Unknown option "${flag}". Try --help.`);
        }
    }

    return options;
}

function fail(message) {
    console.error(`\n[simulator] ${message}\n`);
    process.exit(2);
}

/** Validate everything before touching the network, so a typo cannot half-run. */
function validate(options) {
    if (!BOARD_ID_PATTERN.test(options.boardID ?? '')) {
        fail(
            `"${options.boardID}" is not a valid board id. It becomes the MQTT topic ` +
                'level (sensors/<boardID>/data), so it must be 1-50 characters of A-Z, a-z, 0-9, "_" or "-" ' +
                '- the same rule the API enforces.'
        );
    }

    const condition = CONDITIONS.find(
        (candidate) => candidate.toLowerCase() === String(options.condition).toLowerCase()
    );
    if (!condition) {
        fail(`Unknown condition "${options.condition}". Use one of: ${CONDITIONS.join(', ')}.`);
    }
    options.condition = condition;

    if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
        fail(`--interval must be a number of milliseconds >= 100 (received "${options.intervalMs}").`);
    }
    if (!Number.isInteger(options.count) || options.count < 0) {
        fail(`--count must be a positive whole number (received "${options.count}").`);
    }
    if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
        fail(`--port must be a port number (received "${options.port}").`);
    }
    if (!/^[a-z]+:\/\//i.test(options.broker ?? '')) {
        fail(
            `--broker must include a scheme, e.g. "mqtt://localhost" or "mqtts://broker.example" ` +
                `(received "${options.broker}").`
        );
    }

    return options;
}

// --- Data generation (docs/simulator-module.md 3.2, verbatim bounds) --------
/** Two decimals, like the firmware's %.2f - and no floating-point tails on the wire. */
const round2 = (value) => Math.round(value * 100) / 100;

const randomInRange = (min, max) => round2(Math.random() * (max - min) + min);

/** Integer in [min, max] inclusive. */
const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

/**
 * Build one reading for `boardID` that satisfies `condition`.
 *
 * The bounds are chosen so Node-RED's own thresholds (pH 6.5/7.0/8.0/8.5, turbidity
 * 3.0/5.0 - MASTER_CONTEXT.md 5.3) derive the status the caller asked for, which is
 * the whole point of the "Target Condition" control.
 */
function generatePayload(boardID, condition) {
    let pH;
    let turbidity;

    if (condition === 'Safe') {
        pH = randomInRange(7.0, 8.0);
        turbidity = randomInRange(0.0, 3.0);
    } else if (condition === 'Acceptable') {
        pH = Math.random() > 0.5 ? randomInRange(6.5, 6.99) : randomInRange(8.01, 8.5);
        turbidity = randomInRange(0.0, 5.0);
    } else {
        // Unsafe: either an extreme pH (turbidity stays legal) or high turbidity at a
        // normal pH - the two independent ways to fail the water-quality test.
        if (Math.random() < 0.5) {
            pH = Math.random() > 0.5 ? randomInRange(0.0, 6.49) : randomInRange(8.51, 14.0);
            turbidity = randomInRange(0.0, 5.0);
        } else {
            pH = randomInRange(7.0, 8.0);
            turbidity = randomInRange(5.1, 1000.0);
        }
    }

    return {
        boardID,
        pH,
        turbidity,
        // Voltage and signal vary regardless of the water condition - they describe the
        // device, not the water.
        batt_voltage: randomInRange(3.0, 4.2),
        rssi: randomInt(-100, -30),
        ts: Date.now(),
    };
}

// --- The run ----------------------------------------------------------------
async function main() {
    const options = validate(parseArgs(process.argv.slice(2)));

    if (options.help) {
        console.log(HELP);
        return;
    }

    const topic = `sensors/${options.boardID}/data`;
    const statusTopic = `sensors/${options.boardID}/status`;

    // --dry-run: the generator without a broker, handy for checking bounds.
    if (options.dryRun) {
        const total = options.count || 1;
        for (let index = 0; index < total; index += 1) {
            console.log(`[dry-run] ${topic} ${JSON.stringify(generatePayload(options.boardID, options.condition))}`);
        }
        console.log(`\n[dry-run] ${total} payload(s) for condition "${options.condition}" - nothing was published.`);
        return;
    }

    const url = `${options.broker}:${options.port}`;
    const startedAt = Date.now();
    let published = 0;
    let stopping = false;

    const client = mqtt.connect(url, {
        clientId: `water-ui-simulator-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        // The firmware's Last Will (iot/esp32c3/water_quality_mqtt.ino): if the board
        // drops off, the broker publishes "offline" on the status topic for it.
        will: { topic: statusTopic, payload: 'offline', qos: 0, retain: true },
    });

    /** One reading. Kept separate so `--count` and the interval share one path. */
    function publishReading() {
        const payload = generatePayload(options.boardID, options.condition);

        client.publish(topic, JSON.stringify(payload), { qos: 0 }, (error) => {
            if (error) {
                console.error(`[simulator] publish failed: ${error.message}`);
                return;
            }

            published += 1;
            if (!options.quiet) {
                console.log(
                    `[simulator] #${String(published).padStart(3)} ${topic} ${JSON.stringify(payload)}`
                );
            }

            if (options.count > 0 && published >= options.count) {
                shutdown(0);
            }
        });
    }

    async function shutdown(code) {
        if (stopping) return;
        stopping = true;

        clearInterval(timer);

        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
            `\n[simulator] stopping - ${published} reading(s) published to ${topic} ` +
                `for condition "${options.condition}" in ${seconds}s.`
        );

        // Mark the board offline the way the firmware's will would, so the status topic is
        // left truthful. `end()` is awaited so the packet actually leaves before exit.
        await new Promise((resolve) => {
            client.publish(statusTopic, 'offline', { retain: true }, () => {
                client.end(false, {}, resolve);
            });
        });

        process.exit(code);
    }

    let timer = null;

    client.on('connect', () => {
        console.log(`[simulator] connected to ${url}`);
        console.log(`[simulator] publishing to ${topic} | condition: ${options.condition} | every ${options.intervalMs}ms`);
        if (options.count > 0) {
            console.log(`[simulator] will stop after ${options.count} reading(s)`);
        } else {
            console.log('[simulator] press Ctrl+C to stop');
        }

        client.publish(statusTopic, 'online', { retain: true });

        // Publish immediately, like the firmware does in setup(), so a pipeline check does
        // not have to wait a whole interval for the first point.
        publishReading();

        if (options.count === 0 || options.count > 1) {
            timer = setInterval(publishReading, options.intervalMs);
        }
    });

    client.on('error', (error) => {
        console.error(`\n[simulator] MQTT error: ${error.message}`);
        if (published === 0) {
            console.error(
                '[simulator] nothing was published. Is the broker running?\n' +
                    '            docker compose up -d mosquitto      (from the repo root)\n' +
                    '            docker compose ps                     (check the port mapping)'
            );
            process.exit(1);
        }
    });

    client.on('close', () => {
        if (!stopping && published > 0) {
            console.error('[simulator] broker connection closed');
        }
    });

    process.on('SIGINT', () => void shutdown(0));
    process.on('SIGTERM', () => void shutdown(0));
}

main().catch((error) => {
    console.error(`[simulator] unexpected failure: ${error.stack ?? error.message}`);
    process.exit(1);
});
