/**
 * InfluxDB client (time-series telemetry).
 *
 * Follows the bucket/measurement design in MASTER_CONTEXT.md section 4.2:
 *   bucket      : water_quality_bucket
 *   measurement : water_quality
 *   tags        : board_id, wq_status, batt_level, wifi_status
 *   fields      : pH, turbidity, batt_voltage, rssi
 *
 * Node-RED writes through the InfluxDB HTTP API (see iot/node-red/flows.json);
 * this client is for the Express side - chart reads and dashboard aggregates.
 */
import { InfluxDB, Point } from '@influxdata/influxdb-client';

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN ?? '';
const org = process.env.INFLUXDB_ORG ?? 'water_ui_org';
const bucket = process.env.INFLUXDB_BUCKET ?? 'water_quality_bucket';

/** The measurement every reading is written to. */
export const MEASUREMENT = 'water_quality';

export const influxDB = new InfluxDB({ url, token });

/** Flux queries (historical charts, dashboard aggregates). */
export const queryApi = influxDB.getQueryApi(org);

/** Writes, if the API ever needs to back-fill a point. ns to match Node-RED. */
export const writeApi = influxDB.getWriteApi(org, bucket, 'ns');

/**
 * InfluxDB health probe.
 *
 * Calls the /health endpoint directly: the InfluxDB class in
 * @influxdata/influxdb-client 1.x does not expose health() in its types.
 */
export async function pingInflux(): Promise<{ status: string }> {
    const response = await fetch(`${url}/health`);
    const health = (await response.json()) as { status?: string };

    console.log(`[influx] ${url} -> ${health.status ?? 'unknown'}`);
    return { status: health.status ?? 'unknown' };
}

export { Point };
export const INFLUX = { url, org, bucket, MEASUREMENT } as const;
