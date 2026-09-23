import { columnVisibilityFeature, flexRender, rowSortingFeature, useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, LoaderCircle, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';

import { activeBadge, onlineBadge } from './boardPresentation.js';
import { Badge, LastSeen } from './boardBadges.jsx';

/**
 * Board list table (T-318) - ui-requirement 7.3 plus the device-status columns 6.2
 * documents as shown here.
 *
 * TanStack Table **v9** (`useTable`), not the v8 `useReactTable`: v9 replaces the old
 * `get*RowModel` options with an explicit `features` object, and every optional feature is
 * opt-in. Two are registered:
 *
 *   - `rowSorting` sorts the rows of the *current page*, which is honest for a
 *     server-paginated table and needs no extra request;
 *   - `columnVisibility` is required even though nothing is hidden: `row.getVisibleCells()`
 *     comes from it in v9 (in v8 it existed by default). Leaving it out crashed the page
 *     with "row.getVisibleCells is not a function".
 *
 * Client-side pagination is deliberately NOT enabled, or it would slice the page the API
 * already sliced (20 rows in, 10 out).
 *
 * Columns: **Board ID · Location Name · Status · Online · Last Seen · Actions.**
 *
 * The identifier-ish and device-detail fields the table used to show - MAC Address,
 * Latitude, Longitude, Wi-Fi and Battery - are deliberately **not** columns any more: the
 * table is for spotting the board that needs attention, and the rest of the metadata is one
 * click away in the 👁️ detail modal (`BoardViewModal`, still "full metadata and status" per
 * 7.3). The columns were trimmed to fit a screen without horizontal scrolling.
 *
 * `isOnline` and `lastSeen` can be `null` when InfluxDB is unreachable - they render as
 * Unknown/dash, never as a false "Offline".
 */
export default function BoardTable({ boards, busyBoardId, onView, onEdit, onToggleStatus, onDelete }) {
    const columns = [
        {
            accessorKey: 'boardId',
            header: 'Board ID',
            cell: ({ getValue }) => (
                <span className="font-medium text-gray-800">{getValue()}</span>
            ),
        },
        {
            accessorKey: 'locationName',
            header: 'Location Name',
            cell: ({ getValue }) => <span className="text-gray-700">{getValue()}</span>,
        },
        {
            accessorKey: 'isActive',
            header: 'Status',
            cell: ({ getValue }) => <Badge {...activeBadge(getValue())} />,
        },
        {
            accessorKey: 'isOnline',
            header: 'Connection',
            // Sorting on a tri-state boolean (`null` = unknown) would need a custom
            // comparator; the header is plain for this one.
            enableSorting: false,
            cell: ({ getValue }) => <Badge {...onlineBadge(getValue())} />,
        },
        {
            accessorKey: 'lastSeen',
            header: 'Last Seen',
            enableSorting: false,
            cell: ({ getValue }) => <LastSeen value={getValue()} />,
        },
        {
            id: 'actions',
            header: 'Actions',
            enableSorting: false,
            cell: ({ row }) => (
                <RowActions
                    board={row.original}
                    busy={busyBoardId === row.original.boardId}
                    onView={onView}
                    onEdit={onEdit}
                    onToggleStatus={onToggleStatus}
                    onDelete={onDelete}
                />
            ),
        },
    ];

    // v9: `features` replaces v8's `get*RowModel` options; core is always included.
    const table = useTable({
        data: boards,
        columns,
        features: { rowSorting: rowSortingFeature, columnVisibility: columnVisibilityFeature },
        getRowId: (row) => row.boardId,
    });

    return (
        // Horizontal scroll below `lg` (T-327) - eleven columns cannot fit a phone.
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
                                    {header.isPlaceholder ? null : (
                                        <button
                                            type="button"
                                            disabled={!header.column.getCanSort()}
                                            onClick={header.column.getToggleSortingHandler()}
                                            className={`flex items-center gap-1 ${
                                                header.column.getCanSort() ? 'hover:text-gray-700' : 'cursor-default'
                                            }`}
                                        >
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            <SortIcon direction={header.column.getIsSorted()} />
                                        </button>
                                    )}
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
    );
}

function SortIcon({ direction }) {
    if (direction === 'asc') return <ArrowUp className="h-3 w-3" aria-hidden="true" />;
    if (direction === 'desc') return <ArrowDown className="h-3 w-3" aria-hidden="true" />;

    return <ArrowUpDown className="h-3 w-3 text-gray-300" aria-hidden="true" />;
}

/** 👁️ View · ✏️ Edit · 🔄 Activate/Deactivate · 🗑️ Delete (ui-requirement 7.3). */
function RowActions({ board, busy, onView, onEdit, onToggleStatus, onDelete }) {
    return (
        <div className="flex items-center gap-1">
            {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-gray-400" aria-label="Working" />
            ) : null}

            <IconButton
                label={`View ${board.boardId}`}
                onClick={() => onView(board)}
                className="text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
                <Eye className="h-4 w-4" aria-hidden="true" />
            </IconButton>

            <IconButton
                label={`Edit ${board.boardId}`}
                onClick={() => onEdit(board)}
                className="text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
                <Pencil className="h-4 w-4" aria-hidden="true" />
            </IconButton>

            <IconButton
                label={board.isActive ? `Deactivate ${board.boardId}` : `Activate ${board.boardId}`}
                title={
                    board.isActive
                        ? 'Deactivate: stop treating readings from this board as live'
                        : 'Activate: start accepting readings from this board again'
                }
                disabled={busy}
                onClick={() => onToggleStatus(board)}
                className={
                    board.isActive
                        ? 'text-orange-500 hover:bg-orange-50 hover:text-orange-600'
                        : 'text-green-600 hover:bg-green-50 hover:text-green-700'
                }
            >
                {board.isActive ? (
                    <PowerOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <Power className="h-4 w-4" aria-hidden="true" />
                )}
            </IconButton>

            <IconButton
                label={`Delete ${board.boardId}`}
                onClick={() => onDelete(board)}
                disabled={busy}
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
            >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
        </div>
    );
}

function IconButton({ label, title, onClick, disabled, className, children }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={title ?? label}
            onClick={onClick}
            disabled={disabled}
            className={`rounded-md p-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
            {children}
        </button>
    );
}
