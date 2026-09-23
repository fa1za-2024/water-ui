import { columnVisibilityFeature, flexRender, rowSortingFeature, useTable } from '@tanstack/react-table';
import { LoaderCircle } from 'lucide-react';

import { HISTORICAL_PAGE_SIZES } from './historicalPresentation.js';
import { formatDateTime } from '../../utils/datetime.js';
import { formatMeasurement } from '../../utils/reading.js';
import { waterStatusLabel, waterStatusStyle } from '../../utils/waterStatus.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * Stored readings table (T-322) - ui-requirement 4.2.
 *
 * Columns exactly as specified: Time · Board ID · pH · Turbidity · wq_status · Batt Voltage ·
 * Batt Level · RSSI · Wi-Fi Status.
 *
 * Rules this table carries:
 *   - **Rule 2:** `wq_status` is stored as `Unsafe` and must render **"Not Safe"** - read
 *     from `utils/waterStatus.js`, never spelled out here.
 *   - **Rule 7:** the API sends ISO-8601 UTC; `formatDateTime` renders it with Day.js.
 *   - Missing values are a dash (`formatMeasurement`), never `0` - an empty aggregate window
 *     is not a reading of zero.
 *
 * Like the boards table it is TanStack Table v9 (`useTable` + explicit `features`), and
 * pagination is **server-side** because `GET .../readings` already sits on `page`/`limit`:
 * TanStack's own pagination is deliberately not registered, which would slice a page the API
 * had already sliced. Sorting is registered and sorts the current page only.
 */
export default function ReadingsTable({ readings, isLoading, isFetching, isError, error, page, limit, onPageChange, onLimitChange }) {
    const rows = readings?.data ?? [];
    const total = readings?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / limit));

    const columns = [
        {
            accessorKey: 'time',
            header: 'Time',
            cell: ({ getValue }) => (
                <span className="whitespace-nowrap font-mono text-xs text-gray-600">
                    {formatDateTime(getValue(), '—')}
                </span>
            ),
        },
        {
            accessorKey: 'boardId',
            header: 'Board ID',
            cell: ({ getValue }) => <span className="font-medium text-gray-800">{getValue()}</span>,
        },
        {
            accessorKey: 'pH',
            header: 'pH',
            cell: ({ getValue }) => <Number value={getValue()} decimals={2} />,
        },
        {
            accessorKey: 'turbidity',
            header: 'Turbidity',
            cell: ({ getValue }) => <Number value={getValue()} decimals={2} suffix=" NTU" />,
        },
        {
            accessorKey: 'wqStatus',
            header: 'Water Status',
            enableSorting: false,
            cell: ({ getValue }) => <WaterStatusBadge status={getValue()} />,
        },
        {
            accessorKey: 'battVoltage',
            header: 'Batt Voltage',
            cell: ({ getValue }) => <Number value={getValue()} decimals={2} suffix=" V" />,
        },
        {
            accessorKey: 'battLevel',
            header: 'Batt Level',
            enableSorting: false,
            cell: ({ getValue }) => <span className="text-gray-700">{getValue() ?? '—'}</span>,
        },
        {
            accessorKey: 'rssi',
            header: 'RSSI',
            cell: ({ getValue }) => <Number value={getValue()} decimals={0} suffix=" dBm" />,
        },
        {
            accessorKey: 'wifiStatus',
            header: 'Wi-Fi Status',
            enableSorting: false,
            cell: ({ getValue }) => <span className="text-gray-700">{getValue() ?? '—'}</span>,
        },
    ];

    const table = useTable({
        data: rows,
        columns,
        // v9: `columnVisibility` is required for `row.getVisibleCells()`; sorting is opt-in.
        features: { rowSorting: rowSortingFeature, columnVisibility: columnVisibilityFeature },
        getRowId: (row) => `${row.boardId}-${row.time}`,
    });

    return (
        <div>
            {isError ? (
                <p role="alert" className="p-6 text-sm font-medium text-red-600">
                    {describeApiFailure(error, 'Could not load the readings.')}
                </p>
            ) : null}

            {isLoading ? (
                <p className="flex items-center gap-2 p-6 text-sm text-gray-500" role="status">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading readings…
                </p>
            ) : null}

            {!isLoading && !isError && rows.length === 0 ? (
                <p className="p-10 text-center text-sm text-gray-500">No readings in this range.</p>
            ) : null}

            {!isError && rows.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            scope="col"
                                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                                        >
                                            <button
                                                type="button"
                                                disabled={!header.column.getCanSort()}
                                                onClick={header.column.getToggleSortingHandler()}
                                                className={`flex items-center gap-1 ${
                                                    header.column.getCanSort() ? 'hover:text-gray-700' : 'cursor-default'
                                                }`}
                                            >
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                {header.column.getIsSorted() === 'asc' ? '▲' : null}
                                                {header.column.getIsSorted() === 'desc' ? '▼' : null}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>

                        <tbody className="divide-y divide-gray-100 bg-white">
                            {table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="whitespace-nowrap px-4 py-3">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {!isError && total > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <label htmlFor="readings-limit">Rows per page</label>
                        <select
                            id="readings-limit"
                            value={limit}
                            onChange={(event) => onLimitChange(Number(event.target.value))}
                            className="rounded-md bg-gray-100 px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-purple-500"
                        >
                            {HISTORICAL_PAGE_SIZES.map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                        <span className="ml-2">
                            {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                            {isFetching ? ' · updating…' : ''}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onPageChange(Math.max(1, page - 1))}
                            disabled={page <= 1}
                            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-gray-500">
                            Page {page} of {pageCount}
                        </span>
                        <button
                            type="button"
                            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
                            disabled={page >= pageCount}
                            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/** A dash for a missing measurement - never `0`. */
function Number({ value, decimals = 2, suffix = '' }) {
    const text = formatMeasurement(value, decimals, suffix.trim());

    return <span className={value === null || value === undefined ? 'text-gray-300' : 'text-gray-700'}>{text}</span>;
}

/** Rule 2 lives in one place: `Unsafe` renders as "Not Safe" with the documented colour. */
function WaterStatusBadge({ status }) {
    const style = waterStatusStyle(status);

    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
            {waterStatusLabel(status, '—')}
        </span>
    );
}
