import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import utc from 'dayjs/plugin/utc.js';

/**
 * The configured Day.js instance (Rule 7: the API sends ISO-8601 **UTC** and the UI
 * formats it - the frontend never concatenates its own date strings).
 *
 * The plugins are registered here, once, and every component imports this module rather
 * than `dayjs` directly: `relativeTime` is what `fromNow()` needs, and forgetting it in a
 * component is how "4 minutes ago" silently becomes an ISO string.
 *
 * `utc` keeps parsing honest - the backend serialises with `toISOString()`, so a browser in
 * any timezone reads the same instant.
 */
dayjs.extend(relativeTime);
dayjs.extend(utc);

export default dayjs;

/** Absolute, unambiguous stamp - used for "registered at" style fields. */
export function formatDateTime(value, fallback = null) {
    if (!value) return fallback;

    const moment = dayjs(value);
    return moment.isValid() ? moment.format('DD MMM YYYY HH:mm') : fallback;
}

/**
 * Relative for recent values, absolute for older ones: a status column is read to answer
 * "is this thing alive right now?", and "34 minutes ago" beats a timestamp for that.
 */
export function formatRelativeOrDate(value, relativeWindowHours = 1, fallback = null) {
    if (!value) return fallback;

    const moment = dayjs(value);
    if (!moment.isValid()) return fallback;

    return moment.isAfter(dayjs().subtract(relativeWindowHours, 'hour'))
        ? moment.fromNow()
        : moment.format('DD MMM YYYY HH:mm');
}

/** Full precision, for `title` attributes. */
export function formatFullStamp(value, fallback = null) {
    if (!value) return fallback;

    const moment = dayjs(value);
    return moment.isValid() ? moment.format('DD MMM YYYY HH:mm:ss') : fallback;
}
