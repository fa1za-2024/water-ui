/**
 * KPI card (T-313) - the white metric tile from ui-requirement.md 2.2.
 *
 * Deliberately presentational: it renders whatever label/value/status it is handed and
 * owns no data fetching, so the same tile serves the board counts (T-329), the pH and
 * turbidity readings (2.2) and the water-quality counts without three near-identical
 * components.
 *
 * The `value` is printed as-is (use the em dash for "no data"): this component must not
 * coerce a missing number into `0` - the whole dashboard degrades to "unknown", never to
 * a confident zero (A28).
 */
export default function KpiCard({
    icon: Icon,
    iconClassName = 'bg-brand-100 text-brand-700',
    label,
    value,
    status,
    statusClassName = 'text-gray-400',
    hint,
    title,
}) {
    return (
        <div className="rounded-lg bg-white p-4 shadow-sm" title={title}>
            <div className="flex items-start gap-3">
                {Icon ? (
                    <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
                    >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                ) : null}

                <div className="min-w-0">
                    {/* 2.2: label text-sm text-gray-500, value text-3xl font-bold text-gray-800. */}
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-3xl font-bold leading-tight text-gray-800">{value}</p>
                    {status ? (
                        <p className={`text-sm font-semibold ${statusClassName}`}>{status}</p>
                    ) : null}
                </div>
            </div>

            {hint ? <p className="mt-3 text-xs text-gray-400">{hint}</p> : null}
        </div>
    );
}
