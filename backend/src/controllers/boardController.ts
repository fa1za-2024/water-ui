/**
 * Boards module - the registry of the physical IoT devices in the field.
 *
 * MASTER_CONTEXT.md section 6.2. Documented endpoints and their contract:
 *   GET    /api/boards                  -> 200 { data, total, page, limit }
 *   POST   /api/boards                  -> 201 { board }
 *   GET    /api/boards/:boardID         -> 200 { board }
 *   PUT    /api/boards/:boardID         -> 200 { board }
 *   PATCH  /api/boards/:boardID/status  -> 200 { board }   (is_active)
 *   DELETE /api/boards/:boardID         -> 204 no body
 *
 * Contract decisions this module makes (recorded in MASTER_CONTEXT.md Appendix A):
 *   - Every route requires a JWT, like `/api/users`: boards are managed from the
 *     dashboard behind the login, not from the ingest path.
 *   - `boardId` is IMMUTABLE after create. It is the same identifier as the MQTT
 *     topic level (`sensors/<boardID>/data`), the InfluxDB `board_id` tag and this
 *     REST path param (section 4.1), so changing it here would orphan the series.
 *     A wrong MAC or location is correctable with PUT; a wrong logical id means
 *     re-registering the board.
 *   - Uniqueness is enforced by the UNIQUE keys in MySQL (section 4.1) and the
 *     violation is translated to 409 here. Zod only validates the FORMAT - it
 *     cannot see the database.
 *   - `PATCH .../status` SETS `isActive` from the body rather than flipping it, so
 *     a retried request cannot silently invert the flag.
 *   - Coordinates are checked against the documented ranges, snapped to the 8
 *     decimals the columns store, and returned as JSON numbers - see types/board.ts.
 *   - The device-status columns of section 6.2 (`wifi_status`, `batt_level`,
 *     `last_seen`) are NOT MySQL columns: they are read from the newest InfluxDB
 *     point per board, and `isOnline` is that timestamp inside the A5 window
 *     (15 minutes). See T-208 / services/influxService.ts.
 *
 * TODO: DELETE removes the MySQL row only. The board's InfluxDB points stay until
 * the 30-day retention expires (section 4.2); no series is dropped here - and a
 * re-created board id would therefore inherit its predecessor's `last_seen`.
 * HAZARD (T-230): MySQL's `*_ci` collation makes `board_id` uniqueness
 * case-INSENSITIVE, while the InfluxDB tag it has to match is case-SENSITIVE. So
 * registering `aa240238` blocks `AA240238`, and a registry row whose case differs
 * from what the firmware publishes reads back as an empty series.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../config/db';
import { validatedQuery } from '../middleware/validate';
import { loadBoardStatusLookup, type BoardStatusLookup } from '../services/boardStatus';
import {
    BOARD_ID_PATTERN,
    LATITUDE_RANGE,
    LONGITUDE_RANGE,
    MAC_ADDRESS_PATTERN,
    publicBoardSelect,
    roundCoordinate,
    toPublicBoard,
} from '../types/board';
import { HttpError } from '../utils/httpError';

/** Body for POST /api/boards. */
export const createBoardSchema = z.object({
    boardId: z
        .string()
        .trim()
        .regex(
            BOARD_ID_PATTERN,
            'boardId must be 1-50 characters of A-Z, a-z, 0-9, "_" or "-" (it is also an MQTT topic level)'
        ),
    boardMacAddress: z
        .string()
        .trim()
        .regex(MAC_ADDRESS_PATTERN, 'boardMacAddress must look like 00:1A:2B:3C:4D:5E')
        // Stored upper-case so the API always answers in the canonical form (the
        // `*_ci` collation already treats the two cases as the same MAC).
        .transform((value) => value.toUpperCase()),
    locationName: z.string().trim().min(1, 'locationName is required').max(100),
    latitude: z
        .number()
        .min(LATITUDE_RANGE.min, `latitude must be between ${LATITUDE_RANGE.min} and ${LATITUDE_RANGE.max}`)
        .max(LATITUDE_RANGE.max, `latitude must be between ${LATITUDE_RANGE.min} and ${LATITUDE_RANGE.max}`),
    longitude: z
        .number()
        .min(LONGITUDE_RANGE.min, `longitude must be between ${LONGITUDE_RANGE.min} and ${LONGITUDE_RANGE.max}`)
        .max(LONGITUDE_RANGE.max, `longitude must be between ${LONGITUDE_RANGE.min} and ${LONGITUDE_RANGE.max}`),
    /** Optional; the column defaults to TRUE. */
    isActive: z.boolean().optional(),
});

/**
 * Body for PUT /api/boards/:boardID - all fields optional, but not an empty body.
 * `boardId` is intentionally absent (immutable) and `isActive` is handled by
 * PATCH .../status so the two cannot race.
 */
export const updateBoardSchema = z
    .object({
        boardMacAddress: z
            .string()
            .trim()
            .regex(MAC_ADDRESS_PATTERN, 'boardMacAddress must look like 00:1A:2B:3C:4D:5E')
            .transform((value) => value.toUpperCase())
            .optional(),
        locationName: z.string().trim().min(1).max(100).optional(),
        latitude: z.number().min(LATITUDE_RANGE.min).max(LATITUDE_RANGE.max).optional(),
        longitude: z.number().min(LONGITUDE_RANGE.min).max(LONGITUDE_RANGE.max).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: 'Provide at least one field to update',
    });

/** Body for PATCH /api/boards/:boardID/status. */
export const setBoardStatusSchema = z.object({
    isActive: z.boolean(),
});

/** Query string for GET /api/boards. The UI's rows-per-page options are 20/50/100. */
export const listBoardsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Prisma error codes we translate instead of leaking a 500. */
const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

function prismaCode(error: unknown): string | undefined {
    return (error as { code?: string }).code;
}

/**
 * Read the path param the route pattern guarantees is present.
 *
 * @types/express types every param value as `string | string[]` (Express 5 turns
 * a repeated parameter into an array), so that case is collapsed explicitly
 * instead of cast away - a bad id has to end up a 404, never `undefined`.
 */
function boardIdParam(req: Request): string {
    const raw = req.params.boardID;
    const boardId = Array.isArray(raw) ? raw[0] : raw;

    if (!boardId) {
        throw new HttpError(400, 'A board ID is required in the path');
    }

    return boardId;
}

function boardNotFound(boardId: string): HttpError {
    return new HttpError(404, `Board ${boardId} was not found`);
}

/**
 * Collect every string reachable from a value.
 *
 * Needed because the UNIQUE-key name is not at a stable path: Prisma 7 with
 * `@prisma/adapter-mariadb` leaves `meta.target` UNDEFINED and reports the MySQL
 * constraint instead, nested as `meta.driverAdapterError.cause.constraint.index`
 * (`boards_board_mac_address_key`). Searching beats trusting one path - a shape
 * change then degrades to the generic message instead of a wrong field name.
 */
function metaStrings(value: unknown, found: string[] = [], seen = new Set<unknown>()): string[] {
    if (value === null || value === undefined) return found;

    if (typeof value !== 'object') {
        found.push(String(value));
        return found;
    }

    // Guard against cycles - driver errors carry `cause` chains.
    if (seen.has(value)) return found;
    seen.add(value);

    for (const nested of Object.values(value as Record<string, unknown>)) {
        metaStrings(nested, found, seen);
    }

    return found;
}

/** `P2002` -> 409, naming the field whose UNIQUE key clashed (T-207). */
function conflictFrom(error: unknown): HttpError {
    const meta = (error as { meta?: unknown }).meta;
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    const haystack = [...metaStrings(target), ...metaStrings(meta)].join(' ');

    if (/board_mac_address/i.test(haystack)) {
        return new HttpError(409, 'That MAC address is already registered to another board');
    }

    if (/board_id/i.test(haystack)) {
        return new HttpError(409, 'That board ID is already registered');
    }

    return new HttpError(409, 'A board with those unique values already exists');
}

/**
 * Status lookup for a set of boards (A5: `last_seen` and Online/Offline come from
 * InfluxDB, T-208).
 *
 * The implementation lives in `services/boardStatus.ts`, because the dashboard needs
 * exactly the same read and must degrade the same way; this wrapper only supplies the
 * `[boards]` log label. It still returns a function rather than a map so the two
 * "no status" cases stay distinct:
 *   - InfluxDB read failed  -> `UNKNOWN_BOARD_DETAIL` (`isOnline: null`, unknown)
 *   - board has no point    -> `neverReported()`      (`isOnline: false`, known)
 * A registry page must still render when InfluxDB is down, and it must not call a
 * board Offline just because the query failed.
 */
async function loadStatus(boardIds: readonly string[]): Promise<BoardStatusLookup> {
    const { lookup } = await loadBoardStatusLookup(boardIds, 'boards');

    return lookup;
}

/** GET /api/boards - paginated registry, newest first. */
export async function listBoards(req: Request, res: Response): Promise<void> {
    const { page, limit } = validatedQuery<z.infer<typeof listBoardsQuerySchema>>(req);

    const [total, rows] = await prisma.$transaction([
        prisma.board.count(),
        prisma.board.findMany({
            select: publicBoardSelect,
            // Newest first; `id` breaks the tie so paging can never repeat or skip
            // a row when two boards share a `created_at`.
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    // One InfluxDB query for the page (never one per board), and none at all when
    // the page is empty.
    const statusFor = rows.length > 0 ? await loadStatus(rows.map((row) => row.boardId)) : undefined;

    res.json({
        data: rows.map((row) => toPublicBoard(row, statusFor?.(row.boardId))),
        total,
        page,
        limit,
    });
}

/** POST /api/boards */
export async function createBoard(req: Request, res: Response): Promise<void> {
    const body = req.body as z.infer<typeof createBoardSchema>;

    try {
        const board = await prisma.board.create({
            data: {
                ...body,
                latitude: roundCoordinate(body.latitude),
                longitude: roundCoordinate(body.longitude),
            },
            select: publicBoardSelect,
        });

        const statusFor = await loadStatus([board.boardId]);
        res.status(201).json({ board: toPublicBoard(board, statusFor(board.boardId)) });
    } catch (error) {
        if (prismaCode(error) === UNIQUE_VIOLATION) throw conflictFrom(error);
        throw error;
    }
}

/** GET /api/boards/:boardID */
export async function getBoard(req: Request, res: Response): Promise<void> {
    const boardId = boardIdParam(req);

    const board = await prisma.board.findUnique({
        where: { boardId },
        select: publicBoardSelect,
    });

    if (!board) throw boardNotFound(boardId);

    const statusFor = await loadStatus([board.boardId]);
    res.json({ board: toPublicBoard(board, statusFor(board.boardId)) });
}

/** PUT /api/boards/:boardID */
export async function updateBoard(req: Request, res: Response): Promise<void> {
    const boardId = boardIdParam(req);
    const body = req.body as z.infer<typeof updateBoardSchema>;

    try {
        const board = await prisma.board.update({
            where: { boardId },
            data: {
                ...body,
                // Only touch a coordinate when it was actually sent.
                ...(body.latitude === undefined ? {} : { latitude: roundCoordinate(body.latitude) }),
                ...(body.longitude === undefined ? {} : { longitude: roundCoordinate(body.longitude) }),
            },
            select: publicBoardSelect,
        });

        const statusFor = await loadStatus([board.boardId]);
        res.json({ board: toPublicBoard(board, statusFor(board.boardId)) });
    } catch (error) {
        const code = prismaCode(error);
        if (code === UNIQUE_VIOLATION) throw conflictFrom(error);
        // `update` throws P2025 for a missing row, which saves a second query.
        if (code === RECORD_NOT_FOUND) throw boardNotFound(boardId);
        throw error;
    }
}

/** PATCH /api/boards/:boardID/status - the Activate / Deactivate action. */
export async function setBoardStatus(req: Request, res: Response): Promise<void> {
    const boardId = boardIdParam(req);
    const { isActive } = req.body as z.infer<typeof setBoardStatusSchema>;

    try {
        const board = await prisma.board.update({
            where: { boardId },
            data: { isActive },
            select: publicBoardSelect,
        });

        const statusFor = await loadStatus([board.boardId]);
        res.json({ board: toPublicBoard(board, statusFor(board.boardId)) });
    } catch (error) {
        if (prismaCode(error) === RECORD_NOT_FOUND) throw boardNotFound(boardId);
        throw error;
    }
}

/** DELETE /api/boards/:boardID - permanent removal (the UI confirms first). */
export async function deleteBoard(req: Request, res: Response): Promise<void> {
    const boardId = boardIdParam(req);

    try {
        await prisma.board.delete({ where: { boardId } });
    } catch (error) {
        if (prismaCode(error) === RECORD_NOT_FOUND) throw boardNotFound(boardId);
        throw error;
    }

    // 204 carries no body on purpose.
    res.status(204).send();
}
