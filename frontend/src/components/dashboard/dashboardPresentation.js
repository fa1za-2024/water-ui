import { formatFullStamp } from '../../utils/datetime.js';

/**
 * Presentation helpers shared by the dashboard's count cards (T-329) - **no JSX in this
 * file**, because Vite only compiles JSX in `.jsx`/`.tsx` (the same constraint that keeps
 * `routes.js` and `boardPresentation.js` JSX-free).
 */

/** What a number we do not have looks like. Never `0`: zero is a claim, a dash is not. */
export const NOT_AVAILABLE = '—';

/**
 * A count from `GET /api/dashboard/summary` (A28).
 *
 * `influxAvailable: false` means the whole InfluxDB-derived half of the summary is `null`,
 * so the card must print a dash - rendering "0 online / 0 not safe" would read as a
 * confident all-clear on the primary screen, which is the exact failure A28 exists to
 * prevent. The MySQL-only counts (`total` / `active` / `inactive`) are always numbers.
 */
export function countOrDash(value, influxAvailable) {
    if (influxAvailable === false) return NOT_AVAILABLE;
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : NOT_AVAILABLE;
}

/**
 * The scope every count on this page is computed over, spelled out on the card, because
 * "4 boards offline" is only meaningful once you know deactivated boards are excluded.
 */
export function activeBoardHint(boards) {
    if (!boards || typeof boards.active !== 'number') return null;

    const active = `${boards.active} active board${boards.active === 1 ? '' : 's'} counted`;

    return boards.inactive > 0
        ? `${active} · ${boards.inactive} deactivated excluded`
        : `${active} · no deactivated boards`;
}

/** One sentence for the degraded case, so a dash is explained rather than mysterious. */
export const INFLUX_UNAVAILABLE_NOTE =
    'InfluxDB could not be read, so the counts that depend on it are unknown (shown as “—”). The board registry is still current.';

/** Rule 7: the API sends ISO-8601 UTC, Day.js formats it. */
export function formatGeneratedAt(value) {
    return formatFullStamp(value, null);
}
