/**
 * The API's error envelope, read in one place.
 *
 * The error middleware answers **`{ error: "<message>" }`** for every failure, plus
 * `issues` on a Zod `400` (`{ error, issues }` - see MASTER_CONTEXT.md 6.2). There is no
 * `message` field.
 *
 * This matters because the message carries the actionable half of a failure - "That MAC
 * address is already registered to another board", "Current password is incorrect" - and a
 * client that reads the wrong key silently degrades every one of them to a generic
 * fallback. Three modules had that bug: boards, the profile modal and the login page.
 *
 * `data.message` is still honoured, last, purely as tolerance for a non-RTK/older shape.
 */

/** The API's human-readable message, or null when the body carries none. */
export function apiErrorMessage(failure) {
    const data = failure?.data;

    // A non-JSON body (the Vite dev proxy answers 502 `text/plain`) is the message itself.
    if (typeof data === 'string' && data.trim() !== '') return data.trim();

    if (data && typeof data === 'object') {
        if (typeof data.error === 'string' && data.error.trim() !== '') return data.error.trim();
        if (typeof data.message === 'string' && data.message.trim() !== '') return data.message.trim();
    }

    return null;
}

/** Zod issues, flattened to their messages (a 400 carries `{ error, issues }`). */
export function apiIssues(failure) {
    const issues = failure?.data?.issues;

    if (!Array.isArray(issues)) return [];

    return issues
        .map((issue) => (typeof issue === 'string' ? issue : issue?.message))
        .filter((message) => typeof message === 'string' && message !== '');
}

/**
 * Map a failed RTK Query call to something a person can act on. Transport failures and the
 * shared status codes are handled once; everything else falls back to the API's own words.
 */
export function describeApiFailure(failure, fallback = 'Something went wrong.') {
    const status = failure?.status;

    if (status === 'FETCH_ERROR' || status === 502 || status === 504) {
        return 'The API is not answering. Is the backend running?';
    }

    if (status === 'TIMEOUT_ERROR') return 'The API took too long to answer. Please try again.';

    if (status === 413) return 'That file is larger than the 2 MB limit.';

    if (status === 415) return 'Only PNG, JPEG or WebP images are allowed.';

    const issues = apiIssues(failure);
    if (issues.length > 0) return issues.join(' · ');

    return apiErrorMessage(failure) ?? fallback;
}
