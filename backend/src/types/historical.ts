/**
 * Historical-data module types and the query contract.
 *
 * Mirrors MASTER_CONTEXT.md sections 6.4 (functional) and 7.4 (table/chart), and
 * rules 3 (Excel on the backend with `exceljs`) and 7 (ISO timestamps, Day.js in the UI).
 *
 * Two shapes leave the API:
 *   - `BoardSeries`  - downsampled chart points, one series per board (T-214/T-217).
 *   - `ReadingRow`   - raw stored readings for the table and the `.xlsx` export (T-216).
 *
 * Deliberate contract decisions (recorded as A27 in Appendix A):
 *   - `24h`/`1d` are aliases, as are `7d`/`1w`; `1m` is capped by the bucket's 30-day
 *     retention (§4.2), so a custom span longer than that is rejected rather than
 *     silently truncated.
 *   - The chart series is **aligned**: every board gets the same window timestamps,
 *     with `null` where a window has no data, so an overlay lines up (T-217).
 *   - `field` names stay as stored (`pH`), tag-derived fields are camelCase and
 *     `null` when unknown - the same rule as §6.2's status fields.
 */
import type { BattLevel, WifiStatus, WqStatus } from './sensor';

/**
 * The ranges §6.4 offers, each with the `aggregateWindow()` size used for the chart.
 * The window keeps a chart around 60-170 points per board whatever the range.
 */
export const HISTORY_RANGES = {
    '1h': { seconds: 3_600, window: '1m' },
    '24h': { seconds: 86_400, window: '15m' },
    '1d': { seconds: 86_400, window: '15m' },
    '7d': { seconds: 604_800, window: '1h' },
    '1w': { seconds: 604_800, window: '1h' },
    '1m': { seconds: 2_592_000, window: '6h' },
} as const;

export type HistoryRangeKey = keyof typeof HISTORY_RANGES;

/** Default when the caller passes neither `range` nor `start`/`end` (the §6.4 example). */
export const DEFAULT_RANGE_KEY: HistoryRangeKey = '24h';

/** A custom span may not reach beyond the retention window (§4.2, 30 days). */
export const MAX_SPAN_SECONDS = HISTORY_RANGES['1m'].seconds;

/** Overlaying more boards than this on one chart is not supported. */
export const MAX_SERIES_BOARDS = 5;

/** How many raw rows one export may contain (≈16 days at the 30 s publish rate). */
export const EXPORT_MAX_ROWS = 50_000;

/** Batch size for the export's chunked InfluxDB reads - keeps memory bounded. */
export const EXPORT_CHUNK_ROWS = 5_000;

/** `aggregateWindow()` size for a span that did not come from a named range. */
export function windowForSpan(seconds: number): string {
    if (seconds <= 6 * 3_600) return '1m';
    if (seconds <= 48 * 3_600) return '15m';
    if (seconds <= 14 * 86_400) return '1h';
    return '6h';
}

/** The resolved window, echoed back so the client never has to guess what it got. */
export interface ResolvedRange {
    key: HistoryRangeKey | 'custom';
    /** ISO-8601 UTC, inclusive. */
    start: string;
    /** ISO-8601 UTC, exclusive (InfluxDB's `range` end is exclusive). */
    end: string;
    /** Flux duration literal used by `aggregateWindow()`, e.g. `15m`. */
    window: string;
}

/**
 * One downsampled chart point. Every field is nullable: `aggregateWindow` with
 * `createEmpty: true` emits the window anyway so boards stay aligned, and a
 * missing field means "no data in this window", not zero.
 */
export interface SeriesPoint {
    time: string;
    pH: number | null;
    turbidity: number | null;
    battVoltage: number | null;
    /** Mean of an integer field, so this can be fractional (e.g. -55.5 dBm). */
    rssi: number | null;
}

/** A board's series. Boards with no data in range still appear, with `points: []`. */
export interface BoardSeries {
    boardId: string;
    points: SeriesPoint[];
}

/** One raw stored reading - the shape the table (§7.4) and the export show. */
export interface ReadingRow {
    time: string;
    boardId: string;
    pH: number | null;
    turbidity: number | null;
    wqStatus: WqStatus | null;
    battVoltage: number | null;
    battLevel: BattLevel | null;
    rssi: number | null;
    wifiStatus: WifiStatus | null;
}
