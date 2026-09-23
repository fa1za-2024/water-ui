/**
 * Water-quality status vocabulary (T-307).
 *
 * **Rule 2 / section 7.8:** the InfluxDB tag and the API store `Unsafe`, but the UI must
 * render **"Not Safe"**. The mapping lives here, in one place, so no component ever
 * hard-codes the display string - and nothing ever writes the display string back into
 * state (the store keeps `Unsafe`).
 *
 * The three stored values are the A1 decision: the middle tier is `Acceptable`, not
 * `Warning`. Anything else (an old tag value, a board that never reported) is
 * "unknown" and must render as a neutral dash, never as a colour it has not earned.
 *
 * Consumers today: the count cards, the boards table badges and the map's markers + legend.
 * The "Overall Water Status" bar that also read this file was removed from the dashboard at
 * the user's request (T-331), so the severity helpers went with it.
 */

export const WQ_SAFE = 'Safe';
export const WQ_ACCEPTABLE = 'Acceptable';
export const WQ_UNSAFE = 'Unsafe';

/** Stored value -> interface label (Rule 2). */
const WATER_STATUS_LABELS = {
    [WQ_SAFE]: 'Safe',
    [WQ_ACCEPTABLE]: 'Acceptable',
    [WQ_UNSAFE]: 'Not Safe',
};

/**
 * Rule 2 in one call: `waterStatusLabel('Unsafe') === 'Not Safe'`.
 *
 * `null` / an unrecognised value is *not* "Safe" - it is "no data", so the caller passes
 * the wording it wants for that case (the table uses "—", a card uses "No data").
 */
export function waterStatusLabel(status, unknownLabel = 'No data') {
    return WATER_STATUS_LABELS[status] ?? unknownLabel;
}

/**
 * Colour tokens for each stored value, keyed by the **stored** value so lookups use what
 * the API sends. `hex` is for Leaflet, which needs a real CSS colour for the marker SVG;
 * the class names are the Tailwind tokens from tailwind.config.js (`status.*`) plus the
 * documented 7.8 legend (green / yellow / red).
 */
export const WATER_STATUS_STYLES = {
    [WQ_SAFE]: {
        label: 'Safe',
        hex: '#22c55e',
        text: 'text-green-600',
        badge: 'bg-green-100 text-green-700',
        dot: 'bg-status-safe',
        tile: 'bg-green-50 text-green-600',
        icon: 'CheckCircle2',
    },
    [WQ_ACCEPTABLE]: {
        label: 'Acceptable',
        hex: '#eab308',
        text: 'text-yellow-600',
        badge: 'bg-yellow-100 text-yellow-700',
        dot: 'bg-status-acceptable',
        tile: 'bg-yellow-50 text-yellow-600',
    },
    [WQ_UNSAFE]: {
        label: 'Not Safe',
        hex: '#ef4444',
        text: 'text-red-500',
        badge: 'bg-red-100 text-red-600',
        dot: 'bg-status-unsafe',
        tile: 'bg-red-50 text-red-500',
    },
};

/** Neutral grey for "unknown" - the one thing a marker with no reading may look like. */
export const UNKNOWN_WATER_STATUS_STYLE = {
    label: 'No data',
    hex: '#9ca3af',
    text: 'text-gray-500',
    badge: 'bg-gray-100 text-gray-500',
    dot: 'bg-gray-300',
    tile: 'bg-gray-100 text-gray-400',
};

export function waterStatusStyle(status) {
    return WATER_STATUS_STYLES[status] ?? UNKNOWN_WATER_STATUS_STYLE;
}
