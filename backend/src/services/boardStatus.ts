/**
 * Shared "latest status per board" lookup (T-208), used by the boards registry and
 * the dashboard.
 *
 * Both modules need the same thing - the newest InfluxDB point per board - and both
 * must degrade identically: when InfluxDB cannot be read, every board reports
 * **unknown** (`isOnline: null`), never a false "Offline", and the registry/dashboard
 * still answers `200` (see A5 and T-208's evidence).
 *
 * The result carries the `wq_status` tag as well, because §6.3 colours each map marker
 * and counts Safe/Acceptable/Unsafe from it. `PublicBoard` (§6.2) deliberately exposes
 * only the four documented status fields, so the extra tag is simply ignored there -
 * this is an internal widening, not a change to the boards response shape.
 *
 * `influxAvailable` is returned separately so the dashboard *summary* can tell the UI
 * that its online/offline and water-status counts are unavailable, rather than showing
 * a confident `0`.
 */
import type { BoardStatus } from '../types/board';
import { UNKNOWN_BOARD_STATUS } from '../types/board';
import type { WqStatus } from '../types/sensor';
import { fetchLatestStatusByBoard, neverReported } from './influxService';

/** `BoardStatus` plus the water-quality tag, which exists only in InfluxDB. */
export interface BoardStatusDetail extends BoardStatus {
    wqStatus: WqStatus | null;
}

/** Used when the InfluxDB read fails: nothing is known about any board. */
export const UNKNOWN_BOARD_DETAIL: BoardStatusDetail = { ...UNKNOWN_BOARD_STATUS, wqStatus: null };

/** Resolve one board's status; a board with no point is known-Offline, not unknown. */
export type BoardStatusLookup = (boardId: string) => BoardStatusDetail;

export interface LoadedBoardStatus {
    lookup: BoardStatusLookup;
    /** `false` when the InfluxDB read failed and every board reports unknown. */
    influxAvailable: boolean;
}

/**
 * Read the status of every listed board, degrading instead of throwing.
 *
 * `label` only shapes the log line, so an operator can tell which module degraded
 * (`[boards]` vs `[dashboard]`).
 */
export async function loadBoardStatusLookup(
    boardIds: readonly string[],
    label = 'boards'
): Promise<LoadedBoardStatus> {
    try {
        const byBoard = await fetchLatestStatusByBoard(boardIds);

        return {
            lookup: (boardId) => byBoard.get(boardId) ?? neverReported(boardId),
            influxAvailable: true,
        };
    } catch (error) {
        console.error(
            `[${label}] InfluxDB status read failed, reporting isOnline=null: ${(error as Error).message}`
        );

        return { lookup: () => UNKNOWN_BOARD_DETAIL, influxAvailable: false };
    }
}
