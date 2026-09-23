import { AlertTriangle, HelpCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

import KpiCard from './KpiCard.jsx';
import { countOrDash, NOT_AVAILABLE } from './dashboardPresentation.js';
import {
    UNKNOWN_WATER_STATUS_STYLE,
    WQ_ACCEPTABLE,
    WQ_SAFE,
    WQ_UNSAFE,
    WATER_STATUS_STYLES,
    waterStatusLabel,
} from '../../utils/waterStatus.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * Water-quality counts per active board (T-329) - the row below the board-status row.
 *
 * Values come from `waterStatus` on `GET /api/dashboard/summary`: `safe` / `acceptable` /
 * `unsafe` over the **active** boards only, so a deactivated board is in none of them
 * (A28, and the same exclusion the top row uses).
 *
 * Labels go through `waterStatusLabel()` because **Rule 2** stores `Unsafe` and displays
 * "Not Safe" - the stored value is never changed, only rendered.
 *
 * `unknown` is shown as a fourth tile **only when it is non-zero**. The API puts
 * never-reported boards and unrecognised tag values in that bucket (A1), which is why
 * `safe + acceptable + unsafe + unknown === boards.active` always holds - so when the
 * three named statuses do not add up to the active board count, the user can see why
 * instead of concluding the counts are broken.
 */
const ICONS = {
    [WQ_SAFE]: ShieldCheck,
    [WQ_ACCEPTABLE]: AlertTriangle,
    [WQ_UNSAFE]: ShieldAlert,
};

export default function WaterStatusCards({ summary, isLoading, isError, error }) {
    const waterStatus = summary?.waterStatus ?? null;
    const active = summary?.boards?.active;
    const influxAvailable = summary?.influxAvailable ?? null;

    if (isError) {
        return (
            <div
                role="alert"
                className="rounded-lg bg-white p-4 text-sm font-medium text-red-600 shadow-sm"
            >
                {describeApiFailure(error, 'Could not load the water-quality summary.')}
            </div>
        );
    }

    const pending = isLoading && !summary;

    // The bucket order is the documented severity order (8 / 7.8).
    const tiles = [
        { key: WQ_SAFE, label: waterStatusLabel(WQ_SAFE), count: waterStatus?.safe },
        { key: WQ_ACCEPTABLE, label: waterStatusLabel(WQ_ACCEPTABLE), count: waterStatus?.acceptable },
        { key: WQ_UNSAFE, label: waterStatusLabel(WQ_UNSAFE), count: waterStatus?.unsafe },
    ];

    const hasUnknown = typeof waterStatus?.unknown === 'number' && waterStatus.unknown > 0;

    if (hasUnknown) {
        tiles.push({ key: null, label: 'No data', count: waterStatus.unknown });
    }

    return (
        <div className={`grid gap-4 sm:grid-cols-2 ${hasUnknown ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {tiles.map((tile) => {
                const style = tile.key ? WATER_STATUS_STYLES[tile.key] : UNKNOWN_WATER_STATUS_STYLE;
                const Icon = tile.key ? ICONS[tile.key] : HelpCircle;

                return (
                    <KpiCard
                        key={tile.key ?? 'unknown'}
                        icon={Icon}
                        iconClassName={style.tile}
                        label={tile.label}
                        value={pending ? NOT_AVAILABLE : countOrDash(tile.count, influxAvailable)}
                        status={pending ? 'Loading…' : style.label}
                        statusClassName={pending ? 'text-gray-400' : style.text}
                        hint={
                            typeof tile.count === 'number' && typeof active === 'number'
                                ? `${tile.count} of ${active} active board${active === 1 ? '' : 's'}`
                                : null
                        }
                        title={
                            tile.key === null
                                ? 'Active boards whose newest reading carries no recognisable water-quality status (or that have never reported)'
                                : `Active boards whose newest reading is ${waterStatusLabel(tile.key)}`
                        }
                    />
                );
            })}
        </div>
    );
}
