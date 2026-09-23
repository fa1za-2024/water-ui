import { AlertTriangle, LoaderCircle, Wifi, WifiOff } from 'lucide-react';

import KpiCard from './KpiCard.jsx';
import {
    activeBoardHint,
    countOrDash,
    INFLUX_UNAVAILABLE_NOTE,
    NOT_AVAILABLE,
} from './dashboardPresentation.js';
import { BOARD_ONLINE_WINDOW_MINUTES } from '../../utils/constants.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * The dashboard's top row (T-329): **boards Online** and **boards Offline**.
 *
 * Both numbers come from `boards.online` / `boards.offline` on
 * `GET /api/dashboard/summary`, which counts `is_active = true` only (A28) - a deactivated
 * board is deliberately in no count and on no marker, and the card says so in its footnote
 * rather than leaving the user to wonder why the numbers do not add up to the registry.
 *
 * `online + offline === boards.active` always holds on the server, so the two cards can be
 * read against the hint underneath them.
 */
export default function BoardStatusCards({ summary, isLoading, isError, error }) {
    const boards = summary?.boards ?? null;
    const influxAvailable = summary?.influxAvailable ?? null;

    // The window is echoed by the API, so the wording can never drift from the server's
    // decision (A5, 15 minutes): the browser only reads it.
    const windowMinutes = summary?.onlineWindowMinutes ?? BOARD_ONLINE_WINDOW_MINUTES;
    const hint = activeBoardHint(boards);

    if (isError) {
        return (
            <div
                role="alert"
                className="rounded-lg bg-white p-4 text-sm font-medium text-red-600 shadow-sm"
            >
                {describeApiFailure(error, 'Could not load the board summary.')}
            </div>
        );
    }

    const pending = isLoading && !summary;

    return (
        <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
                <KpiCard
                    icon={Wifi}
                    iconClassName="bg-green-50 text-green-600"
                    label="Boards Online"
                    value={pending ? NOT_AVAILABLE : countOrDash(boards?.online, influxAvailable)}
                    status={pending ? 'Loading…' : `Reported within ${windowMinutes} min`}
                    statusClassName="text-green-600"
                    hint={hint}
                    title={`An active board counts as Online when its newest reading is younger than ${windowMinutes} minutes`}
                />

                <KpiCard
                    icon={WifiOff}
                    iconClassName="bg-red-50 text-red-500"
                    label="Boards Offline"
                    value={pending ? NOT_AVAILABLE : countOrDash(boards?.offline, influxAvailable)}
                    status={pending ? 'Loading…' : `Silent for over ${windowMinutes} min`}
                    statusClassName="text-red-500"
                    hint={hint}
                    title="An active board is Offline when its newest reading is older than the window, or when it has never reported"
                />
            </div>

            {influxAvailable === false ? (
                <p
                    role="note"
                    className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs font-medium text-amber-700"
                >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {INFLUX_UNAVAILABLE_NOTE}
                </p>
            ) : null}

            {pending ? (
                <p className="flex items-center gap-2 text-xs text-gray-400" role="status">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Loading the board summary…
                </p>
            ) : null}
        </div>
    );
}
