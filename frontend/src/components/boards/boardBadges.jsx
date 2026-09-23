import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Wifi, WifiOff } from 'lucide-react';

import { useNow } from '../../hooks/useNow.js';
import {
    battLevelStyle,
    formatLastSeen,
    lastSeenTooltip,
    UNKNOWN_STYLE,
    wifiStatusStyle,
} from './boardPresentation.js';

/**
 * Status badges for the boards module (T-318/T-320).
 *
 * The badge *components* live in this `.jsx` file because Vite only compiles JSX in
 * `.jsx`/`.tsx` files; the colour/vocabulary decisions stay in `boardPresentation.js` so
 * there is one source of truth for them.
 *
 * Every one of these renders a neutral dash when the value is missing: `wifiStatus`,
 * `battLevel` and `lastSeen` are `null` whenever InfluxDB could not be read, and showing
 * "Low" or "Offline" for a value we never received would be a lie (A5).
 */

/** `null` renders as a neutral dash, never as a value we did not receive. */
export function Fallback() {
    return (
        <span className="text-gray-300" title="No data">
            —
        </span>
    );
}

/** A plain pill for a label + colour pair (Active/Inactive, Online/Offline, ...). */
export function Badge({ label, className, title }) {
    return (
        <span
            title={title}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
        >
            {label}
        </span>
    );
}

const BATT_ICONS = {
    Full: BatteryFull,
    Medium: BatteryMedium,
    Low: BatteryLow,
    Critical: BatteryWarning,
};

export function BattBadge({ level }) {
    if (!level) return <Fallback />;

    const Icon = BATT_ICONS[level] ?? BatteryMedium;

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${battLevelStyle(level)}`}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {level}
        </span>
    );
}

export function WifiBadge({ status }) {
    if (!status) return <Fallback />;

    const Icon = status === 'Poor' ? WifiOff : Wifi;

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                status ? wifiStatusStyle(status) : UNKNOWN_STYLE
            }`}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {status}
        </span>
    );
}

export function LastSeen({ value }) {
    // Re-render once a minute so "4 minutes ago" does not freeze while the screen sits idle.
    // Purely cosmetic: no request, and no status is derived from it.
    useNow();

    const text = formatLastSeen(value);

    if (!text) return <Fallback />;

    return (
        <span className="whitespace-nowrap text-xs text-gray-500" title={lastSeenTooltip(value)}>
            {text}
        </span>
    );
}
