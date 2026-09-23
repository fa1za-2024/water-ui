import Modal from '../ui/Modal.jsx';
import { activeBadge, formatBoardDate, formatCoordinate, onlineBadge } from './boardPresentation.js';
import { Badge, BattBadge, Fallback, LastSeen, WifiBadge } from './boardBadges.jsx';

/**
 * Board detail modal (T-318 - the row's 👁️ action).
 *
 * Read-only: ui-requirement 7.3 asks for "full metadata and status", and the editing path
 * is the ✏️ action, so this never writes. Device status comes from the same payload as the
 * table (InfluxDB-derived, A5).
 */
export default function BoardViewModal({ open, board, onClose }) {
    if (!board) return null;

    const active = activeBadge(board.isActive);
    const online = onlineBadge(board.isOnline);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={board.boardId}
            description={board.locationName}
            footer={
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                >
                    Close
                </button>
            }
        >
            <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                    {/* Titled pills (requested): the value alone ("Active", "Online") did not say
                        what it referred to. The value stays live - a deactivated board reads
                        "Board Status : Inactive". */}
                    <Badge
                        label={`Board Status : ${active.label}`}
                        className={active.className}
                        title="Registration state (is_active)"
                    />
                    <Badge
                        label={`Board Connection : ${online.label}`}
                        className={online.className}
                        title={online.title}
                    />
                </div>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Row label="Board ID" value={board.boardId} mono />
                    <Row label="MAC Address" value={board.boardMacAddress} mono />
                    <Row label="Location Name" value={board.locationName} />
                    <Row
                        label="Coordinates"
                        value={
                            formatCoordinate(board.latitude) && formatCoordinate(board.longitude)
                                ? `${formatCoordinate(board.latitude)}, ${formatCoordinate(board.longitude)}`
                                : null
                        }
                        mono
                    />
                    <Row label="Wi-Fi Status" value={board.wifiStatus} render={<WifiBadge status={board.wifiStatus} />} />
                    <Row label="Battery Level" value={board.battLevel} render={<BattBadge level={board.battLevel} />} />
                    <Row label="Last Seen" value={board.lastSeen} render={<LastSeen value={board.lastSeen} />} />
                    <Row label="Registered" value={board.createdAt} format />
                    <Row label="Last Updated" value={board.updatedAt} format />
                </dl>

                {board.isOnline === null || board.isOnline === undefined ? (
                    <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-500">
                        Device status is unknown: InfluxDB could not be read, so the API returned
                        <code className="mx-1">null</code> rather than reporting a false &quot;Offline&quot;.
                    </p>
                ) : null}
            </div>
        </Modal>
    );
}

function Row({ label, value, mono = false, format = false, render }) {
    let content = render ?? null;

    if (!render) {
        const text = format ? formatBoardDate(value) : value;
        const missing = text === null || text === undefined || text === '';

        content = missing ? (
            <Fallback />
        ) : (
            <span className={mono ? 'font-mono text-xs' : ''}>{text}</span>
        );
    }

    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
            <dd className="mt-0.5 text-sm text-gray-700">{content}</dd>
        </div>
    );
}
