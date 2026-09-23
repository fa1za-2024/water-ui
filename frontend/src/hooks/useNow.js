import { useEffect, useState } from 'react';

/**
 * A value that changes every `intervalMs` purely to force a re-render.
 *
 * This exists so relative labels ("4 minutes ago") stay honest on a screen that is otherwise
 * idle. It makes **no network call** - it never fetches and never derives a status: the
 * Online/Offline chips keep whatever `GET /api/boards` last said (see the note in
 * `utils/constants.js` about the browser never re-deriving `isOnline`). Only the wording of
 * a timestamp moves.
 */
export function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);

    return now;
}

export default useNow;
