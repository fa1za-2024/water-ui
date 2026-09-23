/**
 * Shared domain types for the Water UI backend.
 *
 * These mirror the documented contracts:
 *   - SensorReading  : the MQTT payload plus the fields Node-RED derives
 *                      (MASTER_CONTEXT.md section 5.3)
 *   - WqStatus       : the InfluxDB `wq_status` TAG values. Note this is
 *                      'Acceptable', NOT 'Warning' - see Appendix A item A1.
 */

/** Water quality status as STORED (the UI renders 'Unsafe' as "Not Safe"). */
export type WqStatus = 'Safe' | 'Acceptable' | 'Unsafe';

export type BattLevel = 'Full' | 'Medium' | 'Low' | 'Critical';

export type WifiStatus = 'Excellent' | 'Good' | 'Fair' | 'Poor';

/**
 * Allowed values of the InfluxDB `wq_status` / `batt_level` / `wifi_status` tags
 * (section 5.3's threshold table is the single source of truth for these).
 * Needed as runtime values because tag values come back as plain strings.
 */
export const WQ_STATUSES: readonly WqStatus[] = ['Safe', 'Acceptable', 'Unsafe'];
export const BATT_LEVELS: readonly BattLevel[] = ['Full', 'Medium', 'Low', 'Critical'];
export const WIFI_STATUSES: readonly WifiStatus[] = ['Excellent', 'Good', 'Fair', 'Poor'];

/**
 * Narrow a stored tag value to one of the known members.
 *
 * InfluxDB returns every tag as a string, so a `as WqStatus` cast would let a
 * typo or an old tag value (e.g. the pre-A1 `Warning`) reach the API and the UI.
 * Unknown values become `null` instead.
 */
export function asMember<T extends string>(value: unknown, allowed: readonly T[]): T | null {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : null;
}

/** A single telemetry reading as published by the device / enriched by Node-RED. */
export interface SensorReading {
    boardID: string;
    pH: number;
    turbidity: number;
    batt_voltage: number;
    rssi: number;
    wq_status?: WqStatus;
    batt_level?: BattLevel;
    wifi_status?: WifiStatus;
    /** ISO-8601, added by Node-RED from the device timestamp or arrival time. */
    time?: string;
}

/** Shape of the request body Node-RED POSTs to /api/internal/sensor-update. */
export type SensorUpdateBody = SensorReading;
