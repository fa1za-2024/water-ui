import {
    AlertTriangle,
    BatteryFull,
    BatteryLow,
    BatteryMedium,
    BatteryWarning,
    Droplet,
    HelpCircle,
    Layers,
    LoaderCircle,
    ShieldAlert,
    ShieldCheck,
    Wifi,
    WifiOff,
} from 'lucide-react';

import KpiCard from './KpiCard.jsx';
import { NOT_AVAILABLE } from './dashboardPresentation.js';
import {
    batteryVoltageText,
    firstRegisteredStation,
    signalText,
    stationLabel,
    waterStatusAdvice,
} from './stationPresentation.js';
import {
    battLevelStyle,
    formatLastSeen,
    lastSeenTooltip,
    UNKNOWN_STYLE,
    wifiStatusStyle,
} from '../boards/boardPresentation.js';
import { useNow } from '../../hooks/useNow.js';
import { formatMeasurement } from '../../utils/reading.js';
import {
    UNKNOWN_WATER_STATUS_STYLE,
    WQ_ACCEPTABLE,
    WQ_SAFE,
    WQ_UNSAFE,
    waterStatusLabel,
    waterStatusStyle,
} from '../../utils/waterStatus.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * Station condition cards (T-336) - the row below **Water Quality by Board**.
 *
 * Five tiles describing **one** station: its **Water Quality Status** (Rule 2 wording, so
 * `Unsafe` renders as "Not Safe"), its **pH** and **Turbidity** values, its **Wi-Fi
 * connection** and its **battery**. The station is chosen with the picker in the section
 * header and defaults to the **first board registered** (§2.1's "Selection" concept, with
 * the user's requested default instead of "most recently reporting").
 *
 * Where the values come from:
 *
 *   - `GET /api/dashboard/latest/:boardID` -> `{ influxAvailable, board, reading }`, the
 *     newest reading for the selected station (this is what the map popup already shows);
 *   - the `sensor-update` Socket.io event, overlaid by `pages/Dashboard.jsx` as soon as it
 *     arrives, so a pushed reading repaints these cards with **no request** (Rule 5).
 *
 * Degradation is inherited from A28: every InfluxDB-derived value is `null` when InfluxDB
 * could not be read, and a station that never reported has `reading: null`. Both render
 * "—" / "No data" rather than a confident `0.00`, `Poor` or `Critical`, because inventing a
 * value for a reading we never received is the failure that rule exists to prevent.
 *
 * **History:** §2.2's pH/Turbidity cards and §2.3's status bar were removed from this page
 * at the user's request in T-331, which left `ui-requirement.md` §2 and `MASTER_CONTEXT.md`
 * §7.2 carrying a "do not restore without deciding the placement" note. That placement is
 * now decided - below the water-quality counts, above the map - so this component is the
 * sanctioned successor to those two sections. The extras the user asked for (the node
 * condition trio and the station picker) are new; the picker replaces the old arrangement
 * where a map marker click was the only way to change the described board.
 */

const WQ_ICONS = {
    [WQ_SAFE]: ShieldCheck,
    [WQ_ACCEPTABLE]: AlertTriangle,
    [WQ_UNSAFE]: ShieldAlert,
};

const BATT_ICONS = {
    Full: BatteryFull,
    Medium: BatteryMedium,
    Low: BatteryLow,
    Critical: BatteryWarning,
};

const WIFI_ICONS = {
    Excellent: Wifi,
    Good: Wifi,
    Fair: Wifi,
    Poor: WifiOff,
};

/**
 * The station picker.
 *
 * Every option is an **active** board (`stationPresentation.activeStations`), matching the
 * scope the counts and the map already use. It is disabled when only one station is
 * registered, because "change to another station if available" has no second answer - a
 * one-option dropdown that silently does nothing reads as broken.
 *
 * The selection is **shared with the map and the header badge** (the page owns it), so
 * choosing here also moves the marker highlight and the "Board X" pill, and clicking a
 * marker moves this control.
 */
export function StationSelect({ stations = [], selectedBoardId, onSelectStation }) {
    if (stations.length === 0) return null;

    const value = stations.some((board) => board.boardId === selectedBoardId)
        ? selectedBoardId
        : (firstRegisteredStation(stations)?.boardId ?? '');
    const onlyOne = stations.length < 2;

    return (
        <div className="flex items-center gap-2">
            <label htmlFor="station-select" className="text-xs uppercase tracking-wide text-gray-400">
                Station
            </label>
            <select
                id="station-select"
                value={value}
                onChange={(event) => onSelectStation?.(event.target.value)}
                disabled={onlyOne}
                title={
                    onlyOne
                        ? 'Only one active station is registered, so there is nothing to switch to'
                        : 'Choose the station these cards describe'
                }
                className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {stations.map((board) => (
                    <option key={board.boardId} value={board.boardId}>
                        {stationLabel(board)}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default function StationReadingsCards({
    board = null,
    reading = null,
    readingIsLive = false,
    influxAvailable,
    isLoading = false,
    isError = false,
    error,
}) {
    // The reading's age is printed below the cards, so re-render once a minute to keep
    // "4 minutes ago" honest on an otherwise idle screen. No request, no derived status -
    // the same cosmetic-only contract `boardBadges.jsx` uses.
    useNow();

    if (isError) {
        return (
            <div role="alert" className="rounded-lg bg-white p-4 text-sm font-medium text-red-600 shadow-sm">
                {describeApiFailure(error, `Could not load ${stationLabel(board) || 'this station'}'s readings.`)}
            </div>
        );
    }

    // First load only: once a reading exists, a background refetch must not blank the cards.
    const pending = isLoading && !reading;
    const wqStatus = reading?.wqStatus ?? null;
    const style = wqStatus ? waterStatusStyle(wqStatus) : UNKNOWN_WATER_STATUS_STYLE;
    const wifiStyle = reading?.wifiStatus ? wifiStatusStyle(reading.wifiStatus) : UNKNOWN_STYLE;
    const battStyle = reading?.battLevel ? battLevelStyle(reading.battLevel) : UNKNOWN_STYLE;

    const wqAdvice = waterStatusAdvice(wqStatus);
    const voltage = batteryVoltageText(reading);
    const signal = signalText(reading);

    /** "—" while loading, otherwise the value - never a substituted zero (A28). */
    const dash = (value) => (pending ? NOT_AVAILABLE : value);

    /**
     * One tile per condition. `status` is the colour-coded second line and `hint` the grey
     * footnote; a card whose supporting figure did not arrive simply omits that line rather
     * than printing a placeholder for it.
     */
    const cards = [
        {
            key: 'wq',
            icon: WQ_ICONS[wqStatus] ?? HelpCircle,
            iconClassName: style.tile,
            label: 'Water Quality Status',
            value: dash(waterStatusLabel(wqStatus)),
            status: pending ? 'Loading…' : (wqAdvice ?? 'No reading yet'),
            statusClassName: pending ? 'text-gray-400' : style.text,
            title:
                'The stored `wq_status` of this station\'s newest reading. Rule 2: the value is stored as "Unsafe" and shown as "Not Safe".',
        },
        {
            key: 'ph',
            icon: Droplet,
            iconClassName: 'bg-blue-50 text-blue-500',
            label: 'pH Level',
            value: dash(formatMeasurement(reading?.pH, 2)),
            status: null,
            title: 'Real-time pH from this station\'s newest reading',
        },
        {
            key: 'turbidity',
            icon: Layers,
            iconClassName: 'bg-yellow-50 text-yellow-600',
            label: 'Turbidity',
            value: dash(formatMeasurement(reading?.turbidity, 2, 'NTU')),
            status: null,
            title: 'Real-time turbidity from this station\'s newest reading',
        },
        {
            key: 'wifi',
            icon: WIFI_ICONS[reading?.wifiStatus] ?? Wifi,
            iconClassName: wifiStyle,
            label: 'WiFi Connection',
            value: dash(reading?.wifiStatus ?? NOT_AVAILABLE),
            status: signal,
            statusClassName: 'text-gray-500',
            title: 'The `wifi_status` tag of the newest reading, with the RSSI it was derived from',
        },
        {
            key: 'battery',
            icon: BATT_ICONS[reading?.battLevel] ?? BatteryMedium,
            iconClassName: battStyle,
            label: 'Battery Status',
            value: dash(reading?.battLevel ?? NOT_AVAILABLE),
            status: voltage,
            statusClassName: 'text-gray-500',
            title: 'The `batt_level` tag of the newest reading, with the measured battery voltage',
        },
    ];

    return (
        <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {cards.map((card) => (
                    <KpiCard
                        key={card.key}
                        icon={card.icon}
                        iconClassName={card.iconClassName}
                        label={card.label}
                        value={card.value}
                        status={card.status}
                        statusClassName={card.statusClassName}
                        hint={card.hint}
                        title={card.title}
                    />
                ))}
            </div>

            {/* A station that never reported is a known state, not a failure - say so, or the
                five dashes look like a broken request. */}
            {!pending && !reading ? (
                <p role="status" className="text-xs text-gray-500">
                    {board ? stationLabel(board) : 'This station'} has not reported a reading yet, so every value
                    above is unknown rather than zero.
                </p>
            ) : null}

            {influxAvailable === false ? (
                <p
                    role="note"
                    className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs font-medium text-amber-700"
                >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    InfluxDB could not be read, so this station's telemetry is unknown (shown as “—”). The board
                    registry is still current.
                </p>
            ) : null}

            {pending ? (
                <p className="flex items-center gap-2 text-xs text-gray-400" role="status">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Loading the station's readings…
                </p>
            ) : null}

            {reading ? (
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                    <span>{board ? stationLabel(board) : 'Selected station'}</span>
                    {reading.time ? (
                        <span title={lastSeenTooltip(reading.time)}>· reading {formatLastSeen(reading.time)}</span>
                    ) : null}
                    {readingIsLive ? (
                        <span className="font-medium text-green-600" title="Pushed over Socket.io - no request was made">
                            · live from the sensor
                        </span>
                    ) : null}
                </p>
            ) : null}
        </div>
    );
}
