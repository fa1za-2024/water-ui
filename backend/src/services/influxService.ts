/**
 * InfluxDB reads for the board registry, dashboard and historical module.
 *
 * MASTER_CONTEXT.md sections 4.2 / 6.2 / 6.3 / 6.4. Node-RED owns the WRITE path
 * (`iot/node-red/flows.json` posts line protocol to the v2 write API); this module
 * is the read side, used by the API.
 *
 * Appendix A item **A5 is now decided**: a board is *Online* when its newest stored
 * point is no older than `BOARD_ONLINE_WINDOW_MINUTES` (15), and `last_seen` IS that
 * point's `_time` - there is no `boards.last_seen` column, which section 4.1 never
 * defined. So the registry row comes from MySQL and the status half comes from here.
 *
 * The query below is the reason this is not a one-liner:
 *   - `group(columns: ["board_id"]) |> last()` is NOT usable: after merging the
 *     per-field tables it hits "schema collision: cannot group float and integer
 *     types together" because `pH` is a float and `rssi` an integer.
 *   - so the fields are pivoted into one row per timestamp, then sorted descending
 *     and cut to the newest row per board.
 * Verified against the live bucket (see T-208's evidence in `docs/task-tracker.md`).
 *
 * The historical reads at the bottom of this file follow the same rule: every query
 * here was run against the live bucket before it was wired into a route.
 */
import { INFLUX, MEASUREMENT, queryApi } from '../config/influx';
import { BOARD_ONLINE_WINDOW_MINUTES } from '../types/board';
import type { BoardSeries, ReadingRow } from '../types/historical';
import {
    BATT_LEVELS,
    WIFI_STATUSES,
    WQ_STATUSES,
    asMember,
    type BattLevel,
    type WifiStatus,
    type WqStatus,
} from '../types/sensor';

/** Newest stored reading for one board, plus the state derived from its age. */
export interface BoardLatestStatus {
    boardId: string;
    /** ISO-8601 of the newest point, or `null` when the board has never reported. */
    lastSeen: string | null;
    /** `lastSeen` is inside the A5 window. False when there is no data at all. */
    isOnline: boolean;
    wqStatus: WqStatus | null;
    battLevel: BattLevel | null;
    wifiStatus: WifiStatus | null;
}

/** Fields requested from InfluxDB. The Flux filter and the row parser share this. */
const READ_FIELDS = ['pH', 'turbidity', 'batt_voltage', 'rssi'] as const;

/**
 * Oldest point we can ask for: the bucket's retention (section 4.2). A board that
 * has not reported inside the retention window is indistinguishable from one that
 * never reported - both are Offline, which is the honest answer for a registry.
 */
export const RETENTION_DAYS = 30;

const RANGE = `-${RETENTION_DAYS}d`;

/**
 * The start of the retention window as ISO-8601 - the oldest timestamp a read can
 * still see. The dashboard's "latest reading" query uses it as its range start so it
 * asks about exactly the same window as the status query above.
 */
export function retentionStartIso(now: number = Date.now()): string {
    return new Date(now - RETENTION_DAYS * 86_400_000).toISOString();
}

/** The A5 window in milliseconds. Shared with the dashboard summary (T-209). */
export const ONLINE_WINDOW_MS = BOARD_ONLINE_WINDOW_MINUTES * 60 * 1000;

/**
 * A Flux string literal.
 *
 * `board_id` reaches this module from a URL path parameter, so it MUST be escaped:
 * a quote or backslash would otherwise close the literal and change the query
 * (`JSON.stringify` produces exactly Flux's double-quoted escaping).
 */
function fluxString(value: string): string {
    return JSON.stringify(value);
}

/**
 * Flux for "the newest point of every board" (or of the listed boards).
 * Exported for tests/diagnostics - call `fetchLatestStatusByBoard` instead.
 */
export function buildLatestStatusQuery(boardIds?: readonly string[]): string {
    const boardFilter = boardIds?.length
        ? `  |> filter(fn: (r) => ${boardIds.map((id) => `r.board_id == ${fluxString(id)}`).join(' or ')})\n`
        : '';

    const fieldFilter = READ_FIELDS.map((field) => `r._field == ${fluxString(field)}`).join(' or ');

    return `from(bucket: ${fluxString(INFLUX.bucket)})
  |> range(start: ${RANGE})
  |> filter(fn: (r) => r._measurement == ${fluxString(MEASUREMENT)})
  |> filter(fn: (r) => ${fieldFilter})
${boardFilter}  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> group(columns: ["board_id"])
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1)`;
}

/** Shape of a pivoted Flux row (tags and columns, all optional to the parser). */
interface LatestRow {
    board_id?: string;
    _time?: string;
    wq_status?: string;
    batt_level?: string;
    wifi_status?: string;
}

/** Was this timestamp inside the online window? */
export function isInsideOnlineWindow(time: string, now: number = Date.now()): boolean {
    const seen = Date.parse(time);
    return Number.isFinite(seen) && now - seen <= ONLINE_WINDOW_MS;
}

/** A board with no point inside the retention window: known, and Offline. */
export function neverReported(boardId: string): BoardLatestStatus {
    return {
        boardId,
        lastSeen: null,
        isOnline: false,
        wqStatus: null,
        battLevel: null,
        wifiStatus: null,
    };
}

/**
 * Latest status per board, keyed by `board_id`.
 *
 * Throws when InfluxDB cannot be reached or the Flux query fails - callers decide
 * whether that is fatal or should degrade to "status unknown".
 */
export async function fetchLatestStatusByBoard(
    boardIds?: readonly string[]
): Promise<Map<string, BoardLatestStatus>> {
    const rows = await queryApi.collectRows<LatestRow>(buildLatestStatusQuery(boardIds));
    const byBoard = new Map<string, BoardLatestStatus>();

    for (const row of rows) {
        const boardId = row.board_id;
        const time = row._time;

        // A row without a board id or timestamp cannot be attributed to a board.
        if (!boardId || !time) continue;

        byBoard.set(boardId, {
            boardId,
            lastSeen: new Date(time).toISOString(),
            isOnline: isInsideOnlineWindow(time),
            // Tag values are strings in InfluxDB; unknown members become null
            // rather than being cast straight into the API (A1 taught that lesson).
            wqStatus: asMember(row.wq_status, WQ_STATUSES),
            battLevel: asMember(row.batt_level, BATT_LEVELS),
            wifiStatus: asMember(row.wifi_status, WIFI_STATUSES),
        });
    }

    return byBoard;
}

// ---------------------------------------------------------------------------
// Historical reads (T-213): aggregated chart series + raw paginated readings
// ---------------------------------------------------------------------------

/** A Flux time literal. The ISO string is generated by us, never user text. */
function fluxTime(iso: string): string {
    return `time(v: ${fluxString(iso)})`;
}

/** InfluxDB gives numbers for numeric columns and null for empty windows. */
function numOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Flux for the chart: the mean of every field per window, per board.
 *
 * Three details are load-bearing, all verified against the live bucket:
 *   1. `group(columns: ["board_id", "_field"])` comes FIRST. Without it the tag
 *      columns stay in the series key, every tag combination becomes its own table
 *      and one board can produce several rows for the same window.
 *   2. `createEmpty: true` returns a row even for a window with no data (all nulls),
 *      which is what makes several boards line up on one chart (T-217).
 *   3. the pivot comes AFTER the aggregation, turning the fields back into columns.
 * The first bucket starts at the range start (partial), later ones are aligned to the
 * window boundary - identical for every board, so the axis stays shared.
 *
 * NOTE: Flux's `range()` ends with **`stop`**, not `end` (`end` fails with
 * "found unexpected argument end (Expected `stop`)"). The API's query parameter is
 * still `end`, per §6.4 - the rename happens here.
 */
export function buildSeriesQuery(options: {
    boardIds: readonly string[];
    start: string;
    end: string;
    window: string;
}): string {
    const boardFilter = options.boardIds.map((id) => `r.board_id == ${fluxString(id)}`).join(' or ');
    const fieldFilter = READ_FIELDS.map((field) => `r._field == ${fluxString(field)}`).join(' or ');

    return `from(bucket: ${fluxString(INFLUX.bucket)})
  |> range(start: ${fluxTime(options.start)}, stop: ${fluxTime(options.end)})
  |> filter(fn: (r) => r._measurement == ${fluxString(MEASUREMENT)})
  |> filter(fn: (r) => ${fieldFilter})
  |> filter(fn: (r) => ${boardFilter})
  |> group(columns: ["board_id", "_field"])
  |> aggregateWindow(every: ${options.window}, fn: mean, createEmpty: true, timeSrc: "_start")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> group(columns: ["board_id"])
  |> sort(columns: ["_time"])`;
}

/**
 * Flux for the table: the stored readings themselves (no aggregation), newest first,
 * one page at a time. The tags survive the pivot as columns, which is how the table
 * and the export can show `wq_status` / `batt_level` / `wifi_status`.
 */
export function buildReadingsQuery(options: {
    boardId: string;
    start: string;
    end: string;
    limit: number;
    offset: number;
}): string {
    const fieldFilter = READ_FIELDS.map((field) => `r._field == ${fluxString(field)}`).join(' or ');

    return `from(bucket: ${fluxString(INFLUX.bucket)})
  |> range(start: ${fluxTime(options.start)}, stop: ${fluxTime(options.end)})
  |> filter(fn: (r) => r._measurement == ${fluxString(MEASUREMENT)})
  |> filter(fn: (r) => ${fieldFilter})
  |> filter(fn: (r) => r.board_id == ${fluxString(options.boardId)})
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> group(columns: ["board_id"])
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${options.limit}, offset: ${options.offset})`;
}

/**
 * How many stored readings the range holds, for the paginated table's `total`.
 *
 * Counts `pH` records only: the payload contract makes `pH` mandatory on every
 * reading (`docs/mqtt-topics.md` §2), and InfluxDB stores one record per field, so
 * counting all four fields would report 4x the readings.
 */
export function buildReadingCountQuery(options: { boardId: string; start: string; end: string }): string {
    return `from(bucket: ${fluxString(INFLUX.bucket)})
  |> range(start: ${fluxTime(options.start)}, stop: ${fluxTime(options.end)})
  |> filter(fn: (r) => r._measurement == ${fluxString(MEASUREMENT)})
  |> filter(fn: (r) => r._field == "pH")
  |> filter(fn: (r) => r.board_id == ${fluxString(options.boardId)})
  |> group()
  |> count()`;
}

/** Shape of an aggregated Flux row (columns are optional to the parser). */
interface SeriesRow {
    board_id?: string;
    _time?: string;
    pH?: unknown;
    turbidity?: unknown;
    batt_voltage?: unknown;
    rssi?: unknown;
}

/** Shape of a raw pivoted Flux row. */
interface ReadingFluxRow extends SeriesRow {
    wq_status?: string;
    batt_level?: string;
    wifi_status?: string;
}

/**
 * Aggregated series for the requested boards.
 *
 * The result is built from `options.boardIds`, so a board with no data in range is
 * still returned (with `points: []`) instead of silently missing from the chart -
 * and the order is the caller's order.
 */
export async function fetchSeries(options: {
    boardIds: readonly string[];
    start: string;
    end: string;
    window: string;
}): Promise<BoardSeries[]> {
    const rows = await queryApi.collectRows<SeriesRow>(buildSeriesQuery(options));

    const byBoard = new Map<string, BoardSeries>(
        options.boardIds.map((boardId) => [boardId, { boardId, points: [] }])
    );

    for (const row of rows) {
        const series = row.board_id ? byBoard.get(row.board_id) : undefined;

        // A row whose board was not requested (or has no timestamp) is not ours.
        if (!series || !row._time) continue;

        series.points.push({
            time: new Date(row._time).toISOString(),
            pH: numOrNull(row.pH),
            turbidity: numOrNull(row.turbidity),
            battVoltage: numOrNull(row.batt_voltage),
            rssi: numOrNull(row.rssi),
        });
    }

    return [...byBoard.values()];
}

/** One page of raw readings, newest first. */
export async function fetchReadings(options: {
    boardId: string;
    start: string;
    end: string;
    limit: number;
    offset: number;
}): Promise<ReadingRow[]> {
    const rows = await queryApi.collectRows<ReadingFluxRow>(buildReadingsQuery(options));

    return rows
        .filter((row) => row._time)
        .map((row) => ({
            time: new Date(row._time as string).toISOString(),
            boardId: row.board_id ?? options.boardId,
            pH: numOrNull(row.pH),
            turbidity: numOrNull(row.turbidity),
            // Tag values are validated against the documented unions (A1).
            wqStatus: asMember(row.wq_status, WQ_STATUSES),
            battVoltage: numOrNull(row.batt_voltage),
            battLevel: asMember(row.batt_level, BATT_LEVELS),
            rssi: numOrNull(row.rssi),
            wifiStatus: asMember(row.wifi_status, WIFI_STATUSES),
        }));
}

/** Number of raw readings in range (0 when the board has none). */
export async function countReadings(options: {
    boardId: string;
    start: string;
    end: string;
}): Promise<number> {
    const rows = await queryApi.collectRows<{ _value?: unknown }>(buildReadingCountQuery(options));
    const total = rows[0]?._value;

    return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}
