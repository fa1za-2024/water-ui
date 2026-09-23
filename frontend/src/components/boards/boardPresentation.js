import { describeApiFailure } from '../../utils/apiError.js';
import { formatDateTime, formatFullStamp, formatRelativeOrDate } from '../../utils/datetime.js';

/**
 * Presentation helpers for the boards module - **no JSX in this file**: Vite only compiles
 * JSX in `.jsx`/`.tsx` files (the same constraint that keeps `routes.js` JSX-free), so the
 * badge components live in `boardBadges.jsx` and import these helpers.
 *
 * Rule 2 (MASTER_CONTEXT.md 7.8): the DB stores `Unsafe` and the UI must render "Not Safe".
 * That applies to water quality, which the boards table does not show; the vocabularies used
 * here are the sensor ones, whose values are already the display spellings
 * (`Full` / `Medium` / `Low` / `Critical`, `Excellent` / `Good` / `Fair` / `Poor`).
 */

/** Active / Inactive - the MySQL `is_active` flag, not connectivity. */
export function activeBadge(isActive) {
    return isActive
        ? { label: 'Active', className: 'bg-green-100 text-green-700' }
        : { label: 'Inactive', className: 'bg-gray-100 text-gray-500' };
}

/**
 * Connectivity, derived from the newest InfluxDB point (A5: a 15-minute window).
 *
 * `null` means "the status could not be read" and must never be shown as Offline - that is
 * exactly the false negative the backend refuses to produce.
 */
export function onlineBadge(isOnline) {
    if (isOnline === null || isOnline === undefined) {
        return {
            label: 'Unknown',
            className: 'bg-gray-100 text-gray-500',
            title: 'InfluxDB could not be read',
        };
    }

    return isOnline
        ? {
              label: 'Online',
              className: 'bg-green-100 text-green-700',
              title: 'Reported within the last 15 minutes',
          }
        : {
              label: 'Offline',
              className: 'bg-red-100 text-red-600',
              title: 'No reading in the last 15 minutes',
          };
}

const NEUTRAL = 'bg-gray-100 text-gray-500';

const BATT_LEVEL_STYLES = {
    Full: 'bg-green-100 text-green-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    Low: 'bg-orange-100 text-orange-700',
    Critical: 'bg-red-100 text-red-600',
};

const WIFI_STATUS_STYLES = {
    Excellent: 'bg-green-100 text-green-700',
    Good: 'bg-green-100 text-green-700',
    Fair: 'bg-yellow-100 text-yellow-700',
    Poor: 'bg-red-100 text-red-600',
};

export function battLevelStyle(level) {
    return BATT_LEVEL_STYLES[level] ?? NEUTRAL;
}

export function wifiStatusStyle(status) {
    return WIFI_STATUS_STYLES[status] ?? NEUTRAL;
}

/** Unknown battery values (never seen) render as this, not as a level we did not receive. */
export const UNKNOWN_STYLE = NEUTRAL;

/**
 * Rule 7: the API sends ISO-8601 UTC and the UI formats it. `lastSeen` is the newest
 * InfluxDB `_time`, so it is an ISO string or null.
 *
 * Relative for fresh readings, absolute for older ones - a status column is read to answer
 * "is this board alive right now?", and "4 minutes ago" beats a timestamp for that.
 */
export function formatLastSeen(lastSeen) {
    return formatRelativeOrDate(lastSeen, 1, null);
}

/** Full precision, for the `title` tooltip. */
export function lastSeenTooltip(lastSeen) {
    return formatFullStamp(lastSeen, '');
}

/** Registered / last-updated stamps for the detail modal. */
export function formatBoardDate(value) {
    return formatDateTime(value, null);
}

/** Coordinates: 8 decimals are stored; 6 is plenty to read and keeps the column narrow. */
export function formatCoordinate(value, decimals = 6) {
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : null;
}

/**
 * Map a failed RTK Query call to something an operator can act on.
 *
 * Delegates to the shared reader (`src/utils/apiError.js`) so the `{ error }` envelope is
 * understood in one place: this used to look for `data.message`, which the API never sends,
 * so a 409 became "Could not add the board." instead of naming the clashing MAC address.
 */
export function describeBoardFailure(failure, fallback = 'Something went wrong.') {
    return describeApiFailure(failure, fallback);
}

/**
 * Field-level target for a 409, so the form can point at the input it belongs to. The API
 * names the clashing unique column in its message (6.2).
 */
export function conflictField(message = '') {
    if (/MAC address/i.test(message)) return 'boardMacAddress';
    if (/board ID/i.test(message)) return 'boardId';
    return null;
}
