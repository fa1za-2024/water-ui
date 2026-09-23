/**
 * Helpers for the station reading cards (T-336).
 *
 * **No JSX in this file** - Vite only compiles JSX in `.jsx`/`.tsx` files, the same
 * constraint that keeps `dashboardPresentation.js` and `boardPresentation.js` JSX-free.
 *
 * Nothing here duplicates a decision the app already made elsewhere:
 *
 *   - water quality wording and colours come from `utils/waterStatus.js`, so **Rule 2**
 *     ("the DB stores `Unsafe`, the UI renders \"Not Safe\"") is implemented once;
 *   - the Wi-Fi and battery vocabularies come from `components/boards/boardPresentation.js`,
 *     which the registry table already reads. Two copies of "Critical is red" is exactly how
 *     the registry and the dashboard start disagreeing about the same board.
 */

import { WQ_ACCEPTABLE, WQ_SAFE, WQ_UNSAFE } from '../../utils/waterStatus.js';

/**
 * The active boards of a `GET /api/boards` page, in the order the API returned them.
 *
 * The dashboard excludes `is_active = false` from **every** count and **every** marker
 * (§6.3 / A28), so the station picker takes the same scope - a deactivated board must not be
 * selectable here while it is invisible in the counts and on the map, or the page would
 * contradict itself.
 */
export function activeStations(page) {
    return (page?.data ?? []).filter((board) => board.isActive === true);
}

/**
 * "The first board registered" - the one with the oldest `createdAt`.
 *
 * `GET /api/boards` returns the registry **newest first**, so this deliberately re-sorts
 * rather than trusting `data[0]`. Picking by `createdAt` instead of by list order also keeps
 * the default station stable: registering a new board must not silently change which station
 * the cards describe.
 *
 * An unparseable `createdAt` is skipped rather than allowed to win - a `NaN` comparison
 * would otherwise make the choice depend on array order.
 */
export function firstRegisteredStation(stations) {
    if (!Array.isArray(stations) || stations.length === 0) return null;

    return stations.reduce((oldest, board) => {
        if (!oldest) return board;

        const candidate = Date.parse(board.createdAt ?? '');
        const current = Date.parse(oldest.createdAt ?? '');

        if (Number.isNaN(candidate)) return oldest;
        if (Number.isNaN(current)) return board;

        // Strictly older wins; a tie keeps the incumbent, so the pick never flickers
        // between two boards that share a timestamp.
        return candidate < current ? board : oldest;
    }, null);
}

/** `AA240238 — Tank 12`, or just the board ID when no location was recorded. */
export function stationLabel(board) {
    if (!board) return '';

    return board.locationName ? `${board.boardId} — ${board.locationName}` : board.boardId;
}

/**
 * What each stored `wq_status` means for a person standing at the tank.
 *
 * The wording follows `ui-requirement.md` 2.3, which already specified "Not Safe (Do Not
 * Drink)" - this is the same sentence split across the card's value and status line. It is
 * derived from the **stored status only**, never from a second copy of §5.3's thresholds:
 * those live in Node-RED (§5.7), and re-deriving them in the browser is how the two disagree.
 */
const WATER_STATUS_ADVICE = {
    [WQ_SAFE]: 'Safe to drink',
    [WQ_ACCEPTABLE]: 'Treat before drinking',
    [WQ_UNSAFE]: 'Do not drink',
};

/** `null` for an unknown status - the caller decides the wording for "no data". */
export function waterStatusAdvice(status) {
    return WATER_STATUS_ADVICE[status] ?? null;
}

/** Battery voltage as a readable figure, or `null` when the reading did not carry one. */
export function batteryVoltageText(reading) {
    const volts = reading?.battVoltage;

    if (typeof volts !== 'number' || !Number.isFinite(volts)) return null;

    return `${volts.toFixed(2)} V`;
}

/**
 * The Wi-Fi signal strength that the `wifi_status` tag was derived from.
 *
 * Shown next to the status because the tag alone is coarse: "Fair" and "Poor" are one
 * `rssi` step apart, and the dBm figure is what tells them apart. Values stay `null` rather
 * than reading "0 dBm" when the field is missing - a reading we never received is not a
 * signal of zero.
 */
export function signalText(reading) {
    const rssi = reading?.rssi;

    if (typeof rssi !== 'number' || !Number.isFinite(rssi)) return null;

    return `Signal ${rssi} dBm`;
}
