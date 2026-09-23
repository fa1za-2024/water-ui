/**
 * Excel export for the historical module (T-215).
 *
 * Rule 3: the `.xlsx` file is produced **on the backend** with `exceljs` and streamed
 * to the browser - never generated in the browser. MASTER_CONTEXT.md §6.4/§7.4 define
 * the columns, and they are the table's columns, so the file matches what was on screen.
 *
 * The workbook is written with exceljs's **streaming** writer straight into the
 * Express response: rows are committed as they are produced, so a large export never
 * has to be held in memory as a finished buffer.
 *
 * The caller (`historicalController.exportExcel`) has already resolved and validated
 * the board and the range, and has chunked the InfluxDB reads.
 */
import ExcelJS from 'exceljs';
import type { Response } from 'express';

import { EXPORT_MAX_ROWS } from '../types/historical';
import type { ReadingRow, ResolvedRange } from '../types/historical';

export { EXPORT_MAX_ROWS };

/** §7.4's table columns, in order - the export must not invent its own set. */
export const EXPORT_COLUMNS = [
    { header: 'Time', key: 'time', width: 22 },
    { header: 'Board ID', key: 'boardId', width: 14 },
    { header: 'pH', key: 'pH', width: 8 },
    { header: 'Turbidity', key: 'turbidity', width: 12 },
    { header: 'wq_status', key: 'wqStatus', width: 12 },
    { header: 'Batt Voltage', key: 'battVoltage', width: 13 },
    { header: 'Batt Level', key: 'battLevel', width: 12 },
    { header: 'RSSI', key: 'rssi', width: 8 },
    { header: 'Wi-Fi Status', key: 'wifiStatus', width: 13 },
] as const;

/** The media type Excel itself uses for `.xlsx`. */
export const XLSX_CONTENT_TYPE =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * `water-quality-AA240238-7d-20260922-1055.xlsx`.
 *
 * `boardId` and `range.key` are already constrained (registry id / enum), so nothing
 * here can inject a header - the filename is built from validated values only.
 */
export function exportFilename(boardId: string, range: ResolvedRange, now: Date = new Date()): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

    return `water-quality-${boardId}-${range.key}-${stamp}.xlsx`;
}

/** Excel caps sheet names at 31 characters and forbids a few symbols. */
function sheetName(boardId: string): string {
    return boardId.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
}

/** ISO strings stay strings so no timezone is implied by Excel's date coercion. */
function cellValue(value: number | string | null, decimals?: number): string | number {
    if (value === null) return '';
    if (typeof value === 'number' && decimals !== undefined) return Number(value.toFixed(decimals));

    return value;
}

/**
 * Stream the rows into `res` as an `.xlsx` workbook.
 *
 * `rows` is an async iterable, so the caller can page through InfluxDB in chunks and
 * nothing has to hold the whole export in memory before writing.
 *
 * The response headers must already be set by the caller. Once the first bytes are
 * flushed the status can no longer be changed, so the caller catches failures and
 * ends the response instead of trying to send an error body.
 */
export async function streamReadingsWorkbook(
    res: Response,
    options: { boardId: string; rows: AsyncIterable<ReadingRow>; range: ResolvedRange }
): Promise<void> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        // Shared strings would have to be buffered to the end of the file.
        useSharedStrings: false,
    });

    const sheet = workbook.addWorksheet(sheetName(options.boardId), {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = EXPORT_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
    sheet.getRow(1).font = { bold: true };

    sheet.getColumn('time').numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.getColumn('pH').numFmt = '0.00';
    sheet.getColumn('turbidity').numFmt = '0.00';
    sheet.getColumn('battVoltage').numFmt = '0.00';
    sheet.getColumn('rssi').numFmt = '0';

    for await (const row of options.rows) {
        sheet
            .addRow({
                // A real date cell (UTC) so the column sorts and charts in Excel;
                // the ISO string remains the API's contract (Rule 7).
                time: new Date(row.time),
                boardId: row.boardId,
                pH: cellValue(row.pH, 2),
                turbidity: cellValue(row.turbidity, 2),
                wqStatus: cellValue(row.wqStatus),
                battVoltage: cellValue(row.battVoltage, 2),
                battLevel: cellValue(row.battLevel),
                rssi: cellValue(row.rssi),
                wifiStatus: cellValue(row.wifiStatus),
            })
            .commit();
    }

    // Remember the exported window in the sheet itself, under the data.
    sheet.addRow([]).commit();
    sheet
        .addRow([`Range: ${options.range.key} (${options.range.start} - ${options.range.end}, UTC)`])
        .commit();

    await workbook.commit();
}
