/**
 * Dashboard module - the aggregate summary, the map markers and one board's latest reading.
 *
 * MASTER_CONTEXT.md section 6.3. All three routes require a JWT (same as §6.2/§6.4);
 * the documented `POST /api/internal/sensor-update` ingest stays in
 * `routes/dashboardRoutes.ts` because it is mounted at `/api`, not `/api/dashboard`.
 *
 * Where the data comes from:
 *   - MySQL (Prisma) owns the registry: which boards exist, whether they are active,
 *     and their coordinates. Active-board filtering is `is_active = true` (Rule: a
 *     deactivated board must not influence the headline numbers).
 *   - InfluxDB owns "what did it last send": `lastSeen`, `isOnline` (the A5 15-minute
 *     window) and the `wq_status` tag the water-status counts are built from.
 *
 * Degradation (A5 / T-208): if InfluxDB cannot be read, the Influx-derived numbers are
 * `null` and `influxAvailable` is `false`; the routes still answer `200` with the
 * MySQL-only facts, and never report a board as Offline when that is unknown.
 */
import type { Request, Response } from 'express';

import { prisma } from '../config/db';
import { loadBoardStatusLookup } from '../services/boardStatus';
import { fetchReadings, isInsideOnlineWindow, retentionStartIso } from '../services/influxService';
import {
    BOARD_ONLINE_WINDOW_MINUTES,
    UNKNOWN_BOARD_STATUS,
    publicBoardSelect,
    toPublicBoard,
    type BoardStatus,
} from '../types/board';
import type {
    BoardLocation,
    DashboardSummary,
    DashboardWaterStatusCounts,
    LatestReadingResponse,
} from '../types/dashboard';
import { HttpError } from '../utils/httpError';

/** Counts that depend on InfluxDB: unavailable reads report `null`, never `0`. */
const UNKNOWN_WATER_STATUS: DashboardWaterStatusCounts = {
    safe: null,
    acceptable: null,
    unsafe: null,
    unknown: null,
};

/** GET /api/dashboard/summary - §6.3's headline numbers. */
export async function getSummary(_req: Request, res: Response): Promise<void> {
    const boards = await prisma.board.findMany({ select: { boardId: true, isActive: true } });

    const activeBoardIds = boards.filter((board) => board.isActive).map((board) => board.boardId);
    const { lookup, influxAvailable } = await loadBoardStatusLookup(activeBoardIds, 'dashboard');

    let online = 0;
    let offline = 0;
    const waterStatus: DashboardWaterStatusCounts = {
        safe: 0,
        acceptable: 0,
        unsafe: 0,
        unknown: 0,
    };

    for (const boardId of activeBoardIds) {
        const status = lookup(boardId);

        if (status.isOnline) {
            online += 1;
        } else {
            offline += 1;
        }

        // `null` covers both "never reported" and an unrecognised tag value (A1).
        if (status.wqStatus === 'Safe') waterStatus.safe = (waterStatus.safe ?? 0) + 1;
        else if (status.wqStatus === 'Acceptable') waterStatus.acceptable = (waterStatus.acceptable ?? 0) + 1;
        else if (status.wqStatus === 'Unsafe') waterStatus.unsafe = (waterStatus.unsafe ?? 0) + 1;
        else waterStatus.unknown = (waterStatus.unknown ?? 0) + 1;
    }

    const summary: DashboardSummary = {
        generatedAt: new Date().toISOString(),
        onlineWindowMinutes: BOARD_ONLINE_WINDOW_MINUTES,
        influxAvailable,
        boards: {
            total: boards.length,
            active: activeBoardIds.length,
            inactive: boards.length - activeBoardIds.length,
            online: influxAvailable ? online : null,
            offline: influxAvailable ? offline : null,
        },
        waterStatus: influxAvailable ? waterStatus : UNKNOWN_WATER_STATUS,
    };

    res.json(summary);
}

/**
 * GET /api/dashboard/boards-locations - one marker per **active** board (§6.3).
 *
 * Coordinates go through Prisma as `Decimal`, so they are converted to plain JSON
 * numbers here (T-227) - `res.json()` would otherwise emit strings and `react-leaflet`
 * (Rule 4) would plot nothing. A marker whose water status is unknown comes back with
 * `wqStatus: null`, which the UI renders grey rather than inventing a colour.
 */
export async function getBoardLocations(_req: Request, res: Response): Promise<void> {
    const rows = await prisma.board.findMany({
        where: { isActive: true },
        select: publicBoardSelect,
        orderBy: { boardId: 'asc' },
    });

    const { lookup, influxAvailable } = await loadBoardStatusLookup(
        rows.map((row) => row.boardId),
        'dashboard'
    );

    const data: BoardLocation[] = rows.map((row) => {
        const status = lookup(row.boardId);

        return {
            boardId: row.boardId,
            locationName: row.locationName,
            latitude: row.latitude.toNumber(),
            longitude: row.longitude.toNumber(),
            wqStatus: status.wqStatus ?? null,
            isOnline: status.isOnline,
            lastSeen: status.lastSeen,
        };
    });

    res.json({ influxAvailable, count: data.length, data });
}

/** Read the path param the route pattern guarantees is present. */
function boardIdParam(req: Request): string {
    const raw = req.params.boardID;
    const boardId = Array.isArray(raw) ? raw[0] : raw;

    if (!boardId) {
        throw new HttpError(400, 'A board ID is required in the path');
    }

    return boardId;
}

/**
 * GET /api/dashboard/latest/:boardID - the registry row plus its newest reading (§6.3).
 *
 * One InfluxDB query answers both halves: the newest pivoted reading carries the
 * timestamp (`lastSeen`), the tags (`wqStatus`/`battLevel`/`wifiStatus`) and the
 * numeric fields `pH`, `turbidity`, `battVoltage`, `rssi` that the side panel shows.
 *
 * The board is looked up with `findUnique` on the `board_id` column, which MySQL
 * compares case-insensitively, and the **stored** spelling is then used for the
 * InfluxDB tag - so a request for `aa240238` still finds `AA240238`'s data (T-230).
 * Unknown board → `404`; a registered board that never reported → `200` with
 * `reading: null` and `isOnline: false` (known, not unknown).
 */
export async function getLatestReading(req: Request, res: Response): Promise<void> {
    const requested = boardIdParam(req);

    const board = await prisma.board.findUnique({
        where: { boardId: requested },
        select: publicBoardSelect,
    });

    if (!board) {
        throw new HttpError(404, `Board ${requested} was not found`);
    }

    let reading: LatestReadingResponse['reading'] = null;
    let influxAvailable = true;

    try {
        const [newest] = await fetchReadings({
            boardId: board.boardId,
            start: retentionStartIso(),
            end: new Date().toISOString(),
            limit: 1,
            offset: 0,
        });

        reading = newest ?? null;
    } catch (error) {
        influxAvailable = false;
        console.error(
            `[dashboard] InfluxDB latest-reading read failed for ${board.boardId}: ${(error as Error).message}`
        );
    }

    // The reading *is* the status: same timestamp, same tags, same A5 window.
    const status: BoardStatus = !influxAvailable
        ? UNKNOWN_BOARD_STATUS
        : reading
          ? {
                lastSeen: reading.time,
                isOnline: isInsideOnlineWindow(reading.time),
                wifiStatus: reading.wifiStatus,
                battLevel: reading.battLevel,
            }
          : { lastSeen: null, isOnline: false, wifiStatus: null, battLevel: null };

    const payload: LatestReadingResponse = {
        influxAvailable,
        board: toPublicBoard(board, status),
        reading,
    };

    res.json(payload);
}
