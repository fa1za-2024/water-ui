/**
 * Historical data module - chart series, the paginated reading table and the Excel export.
 *
 * MASTER_CONTEXT.md section 6.4. Documented endpoints:
 *   GET /api/historical/:boardID?range=24h
 *   GET /api/historical/:boardID?start=2023-10-01&end=2023-10-02
 *   GET /api/historical/export/excel/:boardID?range=7d     -> .xlsx stream (Rule 3)
 *
 * Two endpoints are added beyond §6.4 because §7.4 cannot be served without them
 * (recorded as A27 in Appendix A):
 *   GET /api/historical?boardIDs=A,B&range=24h      -> overlaid series (T-217)
 *   GET /api/historical/:boardID/readings?page=&limit=  -> the table's rows (§7.4)
 *
 * Contract decisions:
 *   - Every route requires a JWT, like `/api/boards`.
 *   - `range` and `start`+`end` are mutually exclusive; the default is 24h. A custom
 *     span may not exceed the bucket's 30-day retention (rejected, never truncated).
 *   - The chart series is downsampled with `aggregateWindow(fn: mean)` and **aligned**:
 *     every board gets the same window timestamps, `null` where a window is empty.
 *   - `range` is echoed back resolved, so a client never has to guess the window.
 *   - The table is newest-first and paginated; the export is chronological, because a
 *     spreadsheet is read top-down (documented in §6.4).
 *   - Requested board ids are resolved against the registry, so the response carries
 *     the stored spelling and InfluxDB is queried with the exact tag (T-230).
 */
import type { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../config/db';
import { validatedQuery } from '../middleware/validate';
import { exportFilename, streamReadingsWorkbook, XLSX_CONTENT_TYPE } from '../services/excelService';
import { countReadings, fetchReadings, fetchSeries } from '../services/influxService';
import { BOARD_ID_PATTERN } from '../types/board';
import {
    DEFAULT_RANGE_KEY,
    EXPORT_CHUNK_ROWS,
    EXPORT_MAX_ROWS,
    HISTORY_RANGES,
    MAX_SERIES_BOARDS,
    MAX_SPAN_SECONDS,
    windowForSpan,
    type HistoryRangeKey,
    type ReadingRow,
    type ResolvedRange,
} from '../types/historical';
import { HttpError } from '../utils/httpError';

/** The ranges §6.4 lists. `24h`/`1d` and `7d`/`1w` are aliases. */
const RANGE_KEYS = ['1h', '24h', '1d', '7d', '1w', '1m'] as const;

const rangeFields = {
    range: z.enum(RANGE_KEYS).optional(),
    start: z.string().trim().min(1).optional(),
    end: z.string().trim().min(1).optional(),
};

type RangeQuery = z.infer<z.ZodObject<typeof rangeFields>>;

/**
 * `GET /api/historical/:boardID` and the multi-board route (T-217).
 *
 * The schema checks the *shape*; whether `range` and `start`/`end` agree with each
 * other is decided in `resolveHistoryRange`, so that rule lives in exactly one place
 * and can say which of the two mistakes was made.
 */
export const historyQuerySchema = z.object(rangeFields);

/** `GET /api/historical/:boardID/readings` - the table's page size matches the UI (§7.4). */
export const readingsQuerySchema = z.object({
    ...rangeFields,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** `GET /api/historical?boardIDs=A,B` - the overlay list. */
export const multiBoardQuerySchema = z.object({
    ...rangeFields,
    boardIDs: z
        .string()
        .trim()
        .min(1, 'boardIDs is required, e.g. boardIDs=AA240238,BB123456')
        .transform((value) =>
            value
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
        )
        .refine((ids) => ids.length >= 1 && ids.length <= MAX_SERIES_BOARDS, {
            message: `boardIDs must list 1-${MAX_SERIES_BOARDS} boards`,
        })
        .refine((ids) => ids.every((id) => BOARD_ID_PATTERN.test(id)), {
            message: 'Every board id must be 1-50 characters of A-Z, a-z, 0-9, "_" or "-"',
        }),
});

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
 * Turn the query into a concrete window.
 *
 * A named range ends "now"; a custom range is parsed, checked for order and capped at
 * the retention window. The window size for a custom span comes from `windowForSpan`.
 * The mutual exclusion of `range` and `start`/`end` is enforced here, because this is
 * the only place that can tell the caller which of the two mistakes was made.
 */
export function resolveHistoryRange(query: RangeQuery, now: Date = new Date()): ResolvedRange {
    const hasStart = query.start !== undefined;
    const hasEnd = query.end !== undefined;

    if (query.range && (hasStart || hasEnd)) {
        throw new HttpError(400, 'Provide either range or start+end, not both');
    }

    if (query.range) {
        const spec = HISTORY_RANGES[query.range];
        const start = new Date(now.getTime() - spec.seconds * 1000);

        return { key: query.range, start: start.toISOString(), end: now.toISOString(), window: spec.window };
    }

    if (hasStart !== hasEnd) {
        throw new HttpError(400, 'start and end must be provided together');
    }

    if (query.start && query.end) {
        const start = new Date(query.start);
        const end = new Date(query.end);

        if (!Number.isFinite(start.getTime())) throw new HttpError(400, `start is not a valid date: ${query.start}`);
        if (!Number.isFinite(end.getTime())) throw new HttpError(400, `end is not a valid date: ${query.end}`);
        if (end.getTime() <= start.getTime()) throw new HttpError(400, 'end must be after start');

        const spanSeconds = (end.getTime() - start.getTime()) / 1000;

        if (spanSeconds > MAX_SPAN_SECONDS) {
            throw new HttpError(
                400,
                `A custom range may not exceed the bucket's ${MAX_SPAN_SECONDS / 86_400} days of retention ` +
                    `(received ${Math.ceil(spanSeconds / 86_400)} days).`
            );
        }

        return {
            key: 'custom',
            start: start.toISOString(),
            end: end.toISOString(),
            window: windowForSpan(spanSeconds),
        };
    }

    // No range at all: the documented default.
    const spec = HISTORY_RANGES[DEFAULT_RANGE_KEY];
    const start = new Date(now.getTime() - spec.seconds * 1000);

    return { key: DEFAULT_RANGE_KEY, start: start.toISOString(), end: now.toISOString(), window: spec.window };
}

/**
 * Map requested ids onto the registry's stored spelling, 404ing on unknown ones.
 *
 * MySQL compares case-insensitively while the InfluxDB tag does not (T-230), so
 * `aa240238` would match a registry row but return no data. Resolving here both
 * validates the id and guarantees the query uses the exact stored tag.
 */
async function resolveRegisteredBoards(requested: readonly string[]): Promise<string[]> {
    const unique = [...new Set(requested)];
    const rows = await prisma.board.findMany({
        where: { boardId: { in: unique } },
        select: { boardId: true },
    });

    const storedByLowerCase = new Map(rows.map((row) => [row.boardId.toLowerCase(), row.boardId]));
    const missing = unique.filter((id) => !storedByLowerCase.has(id.toLowerCase()));

    if (missing.length > 0) {
        throw new HttpError(404, `Unknown board${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    }

    return unique.map((id) => storedByLowerCase.get(id.toLowerCase()) as string);
}

/** GET /api/historical/:boardID - the chart series for one board. */
export async function getSeries(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<RangeQuery>(req);
    const range = resolveHistoryRange(query);
    const [boardId] = await resolveRegisteredBoards([boardIdParam(req)]);

    const boards = await fetchSeries({ boardIds: [boardId as string], ...range });

    res.json({ range, boards });
}

/** GET /api/historical?boardIDs=A,B - overlaid series, aligned window by window (T-217). */
export async function getMultiBoardSeries(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<z.infer<typeof multiBoardQuerySchema>>(req);
    const range = resolveHistoryRange(query);
    const boardIds = await resolveRegisteredBoards(query.boardIDs);

    const boards = await fetchSeries({ boardIds, ...range });

    res.json({ range, boards });
}

/** GET /api/historical/:boardID/readings - one page of stored readings, newest first. */
export async function getReadings(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<z.infer<typeof readingsQuerySchema>>(req);
    const range = resolveHistoryRange(query);
    const [boardId] = await resolveRegisteredBoards([boardIdParam(req)]);

    const window = { boardId: boardId as string, start: range.start, end: range.end };
    const total = await countReadings(window);

    // Skip the page query entirely when the range holds nothing.
    const data =
        total === 0
            ? []
            : await fetchReadings({
                  ...window,
                  limit: query.limit,
                  offset: (query.page - 1) * query.limit,
              });

    res.json({ data, total, page: query.page, limit: query.limit, range });
}

/**
 * Readings for the export, oldest first, read in chunks.
 *
 * `fetchReadings` pages from the newest row, so the chunks are walked backwards and
 * each page reversed - that yields a single chronological sequence while keeping only
 * one chunk in memory (the spreadsheet is read top-down).
 */
async function* readingsOldestFirst(options: {
    boardId: string;
    range: ResolvedRange;
    total: number;
}): AsyncGenerator<ReadingRow> {
    const pageCount = Math.ceil(options.total / EXPORT_CHUNK_ROWS);

    for (let page = pageCount - 1; page >= 0; page -= 1) {
        const offset = page * EXPORT_CHUNK_ROWS;
        const limit = Math.min(EXPORT_CHUNK_ROWS, options.total - offset);

        const rows = await fetchReadings({
            boardId: options.boardId,
            start: options.range.start,
            end: options.range.end,
            limit,
            offset,
        });

        // Rows arrive newest-first; the export is oldest-first.
        for (const row of rows.reverse()) yield row;
    }
}

/**
 * GET /api/historical/export/excel/:boardID - streamed `.xlsx` (Rule 3, T-216).
 *
 * The file is generated here, on the backend, with `exceljs`; the browser only
 * receives it. `total` is read first so a range that would produce an unreasonable
 * file is refused with a clear message instead of streaming for minutes.
 */
export async function exportExcel(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<RangeQuery>(req);
    const range = resolveHistoryRange(query);
    const [boardId] = await resolveRegisteredBoards([boardIdParam(req)]);

    const window = { boardId: boardId as string, start: range.start, end: range.end };
    const total = await countReadings(window);

    if (total > EXPORT_MAX_ROWS) {
        throw new HttpError(
            400,
            `That range holds ${total} readings; the export is capped at ${EXPORT_MAX_ROWS}. ` +
                'Narrow the range and try again.'
        );
    }

    // Headers first: from here on the body is a file, not JSON.
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(boardId as string, range)}"`);
    res.setHeader('Cache-Control', 'no-store');

    try {
        await streamReadingsWorkbook(res, {
            boardId: boardId as string,
            range,
            rows: readingsOldestFirst({ boardId: boardId as string, range, total }),
        });
    } catch (error) {
        console.error(`[historical] xlsx export failed for ${boardId}: ${(error as Error).message}`);

        // Before any bytes are flushed the error middleware can still answer properly;
        // afterwards the only honest thing left is to cut the download short.
        if (!res.headersSent) throw error;
        res.destroy(error as Error);
    }
}

/** Re-exported so the route file and tests can assert the documented cap. */
export { EXPORT_MAX_ROWS, HISTORY_RANGES, MAX_SERIES_BOARDS, type HistoryRangeKey, type ResolvedRange };
