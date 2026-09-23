import { useState } from 'react';
import { AlertTriangle, LoaderCircle, Plus } from 'lucide-react';

import {
    useDeleteBoardMutation,
    useGetBoardsQuery,
    useSetBoardStatusMutation,
} from '../api/boardApi.js';
import BoardFormModal from '../components/boards/BoardFormModal.jsx';
import BoardTable from '../components/boards/BoardTable.jsx';
import BoardViewModal from '../components/boards/BoardViewModal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { describeBoardFailure } from '../components/boards/boardPresentation.js';
import { useBoardLiveUpdates } from '../hooks/useBoardLiveUpdates.js';

/**
 * Boards page (T-318 list, T-319 add, T-320 row actions) - `/boards`.
 *
 * The full CRUD surface against the six endpoints in 6.2:
 *   list (server-paginated)  Add (modal)  Edit (same modal)  Activate/Deactivate
 *   (PATCH, sets rather than flips)  Delete (confirmation modal)  View (read-only modal)
 *
 * Pagination is server-side because the endpoint already is: `GET /api/boards?page=&limit=`
 * answers `{ data, total, page, limit }`. Sorting inside a page is TanStack's job
 * (`BoardTable`); sorting across the whole registry would need an API parameter that does
 * not exist yet, so it is not offered.
 *
 * The list keeps itself current, and there is no Refresh button:
 *   - **on mount** RTK Query fetches it, so the page is populated without a click;
 *   - **live** a pushed `sensor-update` patches the cached row for the board that reported
 *     and then re-reads the list from the API (`useBoardLiveUpdates`, Rule 5: Socket.io,
 *     never polling);
 *   - **on tab focus / reconnect** the query is revalidated (RTK Query's focus and reconnect
 *     listeners), so a screen left open overnight is correct when the operator returns to it.
 * `isOnline` is always the API's answer - the browser never re-derives it (utils/constants.js).
 */
const LIMIT_OPTIONS = [10, 20, 50];

export default function Boards() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);

    const { data, isLoading, isError, error } = useGetBoardsQuery({ page, limit });

    // Draws pushed readings into the table (and asks the API to confirm them).
    useBoardLiveUpdates({ page, limit });
    const [setBoardStatus] = useSetBoardStatusMutation();
    const [deleteBoard, { isLoading: isDeleting }] = useDeleteBoardMutation();

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [viewing, setViewing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [busyBoardId, setBusyBoardId] = useState(null);
    // A failed toggle/delete is reported on the page, not swallowed.
    const [actionError, setActionError] = useState(null);

    const boards = data?.data ?? [];
    const total = data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / limit));

    function openAdd() {
        setEditing(null);
        setFormOpen(true);
    }

    function openEdit(board) {
        setEditing(board);
        setFormOpen(true);
    }

    /** PATCH sets the flag explicitly, so a double click cannot flip it back and forth. */
    async function toggleStatus(board) {
        setActionError(null);
        setBusyBoardId(board.boardId);

        try {
            await setBoardStatus({ boardId: board.boardId, isActive: !board.isActive }).unwrap();
        } catch (failure) {
            setActionError(describeBoardFailure(failure, `Could not update ${board.boardId}.`));
        } finally {
            setBusyBoardId(null);
        }
    }

    async function confirmDelete() {
        const board = deleting;
        setActionError(null);
        setBusyBoardId(board.boardId);

        try {
            await deleteBoard(board.boardId).unwrap();
            setDeleting(null);

            // Deleting the only row of the last page would leave the user on an empty page.
            if (boards.length === 1 && page > 1) setPage((current) => current - 1);
        } catch (failure) {
            setDeleting(null);
            setActionError(describeBoardFailure(failure, `Could not delete ${board.boardId}.`));
        } finally {
            setBusyBoardId(null);
        }
    }

    return (
        <div className="min-h-full p-6">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Boards</h2>
                    <p className="text-sm text-gray-500">
                        Sensor boards registered in the system. {total > 0 ? `${total} in total.` : ''}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* ui-requirement 7.3: the Add button sits at the top of the table.
                        There is deliberately no Refresh button: the list is pushed to, and
                        a manual refresh would be the only reason to have one. */}
                    <button
                        type="button"
                        onClick={openAdd}
                        className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add Board
                    </button>
                </div>
            </header>

            {actionError ? (
                <p
                    role="alert"
                    className="mb-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm font-medium text-red-600"
                >
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {actionError}
                </p>
            ) : null}

            <div className="rounded-lg bg-white shadow-sm">
                {isLoading ? (
                    <p className="flex items-center gap-2 p-6 text-sm text-gray-500" role="status">
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Loading boards…
                    </p>
                ) : null}

                {isError ? (
                    <p role="alert" className="p-6 text-sm font-medium text-red-600">
                        {describeBoardFailure(error, 'Could not load the boards.')}
                    </p>
                ) : null}

                {!isLoading && !isError && boards.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="text-sm text-gray-500">No boards registered yet.</p>
                        <button
                            type="button"
                            onClick={openAdd}
                            className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                        >
                            Add the first board
                        </button>
                    </div>
                ) : null}

                {!isError && boards.length > 0 ? (
                    <BoardTable
                        boards={boards}
                        busyBoardId={busyBoardId}
                        onView={setViewing}
                        onEdit={openEdit}
                        onToggleStatus={toggleStatus}
                        onDelete={setDeleting}
                    />
                ) : null}

                {/* Server-side pagination (page/limit), because the API already paginates. */}
                {!isError && total > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <label htmlFor="boards-limit">Rows per page</label>
                            <select
                                id="boards-limit"
                                value={limit}
                                onChange={(event) => {
                                    setLimit(Number(event.target.value));
                                    setPage(1);
                                }}
                                className="rounded-md bg-gray-100 px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                {LIMIT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                            <span className="ml-2">
                                {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
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
                                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                                disabled={page >= pageCount}
                                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            <BoardFormModal open={formOpen} board={editing} onClose={() => setFormOpen(false)} />

            <BoardViewModal open={Boolean(viewing)} board={viewing} onClose={() => setViewing(null)} />

            <ConfirmDialog
                open={Boolean(deleting)}
                danger
                busy={isDeleting}
                title={`Delete ${deleting?.boardId ?? ''}?`}
                confirmLabel="Delete board"
                message={
                    <>
                        <p>
                            <strong>{deleting?.boardId}</strong> ({deleting?.locationName}) will be removed from
                            the registry. This cannot be undone.
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                            Its historical readings stay in InfluxDB until the 30-day retention removes them, so
                            past charts are unaffected.
                        </p>
                    </>
                }
                onConfirm={confirmDelete}
                onClose={() => setDeleting(null)}
            />
        </div>
    );
}
