/**
 * Reading shape normalisation.
 *
 * Two payloads describe the same reading and they use **different key spellings**:
 *
 *   - REST (`GET /api/dashboard/latest/:boardID`, the historical readings route):
 *     camelCase, and tag-derived fields are already narrowed - `wqStatus`, `battVoltage`.
 *   - Socket.io `sensor-update` (`SensorReading` in the backend, the §5.1 wire payload):
 *     snake_case, and `boardID` rather than `boardId`.
 *
 * Both travel through the dashboard (the KPI cards prefer the socket copy because it is
 * the freshest), so they are normalised once here instead of every component learning
 * two spellings. This is presentation glue only - it never derives a status: `wqStatus`
 * is whatever the API or Node-RED computed (section 5.7 keeps that logic server-side).
 */

/** `null` for anything that is not a finite number - never `0` for a missing value. */
function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;

    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

/** Normalise either payload into one shape, or `null` when there is no reading. */
export function normalizeReading(row) {
    if (!row || typeof row !== 'object') return null;

    return {
        boardId: row.boardId ?? row.boardID ?? null,
        pH: toNumber(row.pH),
        turbidity: toNumber(row.turbidity),
        wqStatus: row.wqStatus ?? row.wq_status ?? null,
        battVoltage: toNumber(row.battVoltage ?? row.batt_voltage),
        battLevel: row.battLevel ?? row.batt_level ?? null,
        rssi: toNumber(row.rssi),
        wifiStatus: row.wifiStatus ?? row.wifi_status ?? null,
        time: row.time ?? null,
    };
}

/**
 * A measurement for display. Missing values render as an em dash, never as "0" - the
 * dashboard must not invent a reading (the same rule the summary's `null` counts follow).
 */
export function formatMeasurement(value, decimals = 2, unit = '') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';

    return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}
