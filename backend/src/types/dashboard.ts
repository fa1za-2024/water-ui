/**
 * Dashboard module response types (MASTER_CONTEXT.md section 6.3).
 *
 * The dashboard is a read-only aggregate view: MySQL knows which boards exist and
 * where they are, InfluxDB knows what they last transmitted. Nothing here is stored.
 *
 * Degradation rule (same as §6.2 / T-208): when InfluxDB cannot be read, the numbers
 * that depend on it are `null` - "unknown" - rather than `0`, which would read as a
 * confident "nothing is online and all water is fine".
 */
import type { PublicBoard } from './board';
import type { ReadingRow } from './historical';
import type { WqStatus } from './sensor';

/** §6.3's board-status summary, counting **active** boards for online/offline. */
export interface DashboardBoardCounts {
    /** Every registered board, active or not. */
    total: number;
    active: number;
    inactive: number;
    /** Active boards whose newest point is inside the A5 window. `null` = unreadable. */
    online: number | null;
    /** Active boards outside the window, or that have never reported. `null` = unreadable. */
    offline: number | null;
}

/**
 * §6.3's water-status summary across active boards.
 * The UI shows "Not Safe" for `unsafe` (Rule 2: DB value `Unsafe` ↔ UI label).
 */
export interface DashboardWaterStatusCounts {
    safe: number | null;
    acceptable: number | null;
    unsafe: number | null;
    /** Active boards whose newest point carries no recognisable `wq_status`. */
    unknown: number | null;
}

export interface DashboardSummary {
    generatedAt: string;
    /** The A5 window the counts were computed with, in minutes (15). */
    onlineWindowMinutes: number;
    influxAvailable: boolean;
    boards: DashboardBoardCounts;
    waterStatus: DashboardWaterStatusCounts;
}

/** One map marker: the MySQL coordinates plus the InfluxDB-derived status. */
export interface BoardLocation {
    boardId: string;
    locationName: string;
    /** Plain JSON numbers, never the driver's `Decimal` strings (T-227 / Rule 4). */
    latitude: number;
    longitude: number;
    wqStatus: WqStatus | null;
    isOnline: boolean | null;
    lastSeen: string | null;
}

export interface BoardLocationsResponse {
    influxAvailable: boolean;
    count: number;
    data: BoardLocation[];
}

/** `GET /api/dashboard/latest/:boardID` - the registry row plus its newest reading. */
export interface LatestReadingResponse {
    influxAvailable: boolean;
    board: PublicBoard;
    /** `null` when the board has never reported, or when InfluxDB could not be read. */
    reading: ReadingRow | null;
}
