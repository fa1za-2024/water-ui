/**
 * Historical module definitions - **no JSX here** (Vite only compiles JSX in `.jsx`), so the
 * chart, the table and the export button all read their vocabulary from this file.
 *
 * Sources of truth it does *not* duplicate: the water-quality labels and colours come from
 * `utils/waterStatus.js` (Rule 2: the stored `Unsafe` renders as "Not Safe"), numbers from
 * `utils/reading.js`, and timestamps from `utils/datetime.js` (Rule 7).
 */

/**
 * The five range buttons of ui-requirement 4.1.
 *
 * `1d` and `1w` are the API's own aliases of `24h` and `7d` (section 6.4), kept because the
 * requirement names those five labels explicitly - they are honest to send, and the API
 * echoes the resolved window back so the UI never has to guess it.
 */
export const HISTORICAL_RANGES = [
    { key: '1h', label: '1 Hour' },
    { key: '24h', label: '24 Hours' },
    { key: '1d', label: '1 Day' },
    { key: '7d', label: '1 Week' },
    { key: '1m', label: '1 Month' },
];

/**
 * Rows-per-page choices for the readings table (4.2: 20 / 50 / 100).
 *
 * This lives here rather than in `utils/constants.js`: that file is now scoped to the
 * cross-cutting board/map values, and the API accepts `limit` 1-100 for this route only.
 */
export const HISTORICAL_PAGE_SIZES = [20, 50, 100];

export const DEFAULT_HISTORICAL_RANGE = '24h';

/** The custom-range button is not an API key - it switches the request to `start` + `end`. */
export const CUSTOM_RANGE = 'custom';

/**
 * The chart's series (4.1: pH, turbidity, battery voltage and RSSI).
 *
 * Each metric gets **its own Y axis**, because the units are genuinely different
 * (pH units, NTU, volts, dBm) and stacking pH 0-14 next to RSSI -65 would flatten the pH
 * line into the axis. pH keeps the documented 0-14 window (2.5 uses the same rule); the
 * others auto-scale. `default: true` gives the dual-axis water-quality view on first paint,
 * and the device metrics are one click away.
 */
export const CHART_METRICS = [
    {
        key: 'pH',
        label: 'pH',
        unit: '',
        colour: '#7c3aed',
        axis: { id: 'y', position: 'left', min: 0, max: 14, title: 'pH' },
        default: true,
    },
    {
        key: 'turbidity',
        label: 'Turbidity',
        unit: 'NTU',
        colour: '#eab308',
        axis: { id: 'y1', position: 'right', beginAtZero: true, title: 'Turbidity (NTU)' },
        default: true,
    },
    {
        key: 'battVoltage',
        label: 'Battery Voltage',
        unit: 'V',
        colour: '#22c55e',
        axis: { id: 'y2', position: 'right', beginAtZero: false, title: 'Battery (V)' },
        default: false,
    },
    {
        key: 'rssi',
        label: 'RSSI',
        unit: 'dBm',
        colour: '#0ea5e9',
        axis: { id: 'y3', position: 'right', beginAtZero: false, title: 'RSSI (dBm)' },
        default: false,
    },
];

export const DEFAULT_METRIC_KEYS = CHART_METRICS.filter((metric) => metric.default).map((metric) => metric.key);

/**
 * Board colours for the overlay (T-217 allows up to 5 boards). Used when more than one
 * board is charted; with a single board the metric colours above are what the operator
 * reads instead.
 */
export const OVERLAY_COLOURS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f97316', '#ec4899'];

/** `range.window` comes back as an InfluxDB duration (`1m`, `15m`, `1h`, `6h`). */
export function describeWindow(window, fallback = 'the selected window') {
    const words = {
        '1m': 'minute',
        '5m': '5-minute',
        '15m': '15-minute',
        '1h': 'hourly',
        '6h': '6-hour',
    };

    if (typeof window !== 'string' || window === '') return fallback;

    const label = words[window];

    return label ? `${label} averages` : `means per ${window}`;
}
