import { useMemo } from 'react';
import {
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    TimeScale,
    Title,
    Tooltip,
} from 'chart.js';
import 'chartjs-adapter-dayjs-4';
import { Line } from 'react-chartjs-2';
import { LoaderCircle } from 'lucide-react';

import { CHART_METRICS } from './historicalPresentation.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * Historical chart (T-321) - ui-requirement 4.1: a Chart.js line chart of pH, turbidity,
 * battery voltage and RSSI over the selected range.
 *
 * Chart.js v4 is tree-shakeable, so every element the chart uses is registered here (and the
 * Day.js adapter, which Rule 7's ISO-8601 timestamps need for the time axis).
 *
 * **One Y axis per metric.** The four series have four different units (pH units, NTU, volts,
 * dBm), and sharing an axis would either flatten pH into a line at zero or invent a scale
 * that means nothing for any of them. Only the enabled metrics' axes are drawn, so the
 * default view is the documented dual-axis picture (pH left 0-14, turbidity right) and
 * enabling battery or RSSI adds its own labelled axis rather than distorting the others.
 *
 * `aggregateWindow` with `createEmpty` means an empty window arrives as `null`, which Chart.js
 * leaves as a **gap** - an honest "no data here" instead of a line drawn through zero.
 */
ChartJS.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function HistoricalChart({ series, metrics, isLoading, isError, error, rangeLabel }) {
    const enabled = CHART_METRICS.filter((metric) => metrics.includes(metric.key));

    const chart = useMemo(() => {
        const points = series?.boards?.[0]?.points ?? [];

        if (enabled.length === 0 || points.length === 0) return null;

        return {
            datasets: enabled.map((metric) => ({
                label: metric.unit ? `${metric.label} (${metric.unit})` : metric.label,
                data: points.map((point) => ({ x: point.time, y: point[metric.key] })),
                borderColor: metric.colour,
                backgroundColor: `${metric.colour}22`,
                borderWidth: 2,
                pointRadius: 0,
                pointHitRadius: 8,
                tension: 0.25,
                // Gaps stay gaps: a window with no reading is not a zero.
                spanGaps: false,
                yAxisID: metric.axis.id,
            })),
        };
    }, [series, metrics]);

    const options = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        // Full timestamp on hover - the axis is abbreviated on purpose.
                        title: (items) => items.map((item) => item.parsed?.x).filter(Boolean),
                    },
                },
            },
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'DD MMM YYYY HH:mm' },
                    ticks: { maxRotation: 0, autoSkipPadding: 24 },
                    grid: { display: false },
                },
                // Only the enabled metrics get an axis, so the chart is never busier than it
                // has to be.
                ...Object.fromEntries(
                    enabled.map((metric) => [
                        metric.axis.id,
                        {
                            type: 'linear',
                            position: metric.axis.position,
                            title: { display: true, text: metric.axis.title },
                            min: metric.axis.min,
                            max: metric.axis.max,
                            beginAtZero: metric.axis.beginAtZero ?? false,
                            grid: { drawOnChartArea: metric.axis.position === 'left' },
                        },
                    ])
                ),
            },
        }),
        [enabled]
    );

    if (isLoading) {
        return (
            <p className="flex h-80 items-center justify-center gap-2 text-sm text-gray-500" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading chart…
            </p>
        );
    }

    if (isError) {
        return (
            <p role="alert" className="flex h-80 items-center justify-center text-sm font-medium text-red-600">
                {describeApiFailure(error, 'Could not load the chart.')}
            </p>
        );
    }

    if (enabled.length === 0) {
        return (
            <p className="flex h-80 items-center justify-center text-sm text-gray-500">
                Pick at least one series to plot.
            </p>
        );
    }

    if (!chart) {
        return (
            <p className="flex h-80 items-center justify-center text-sm text-gray-500">
                No readings for {rangeLabel}.
            </p>
        );
    }

    return (
        <div className="h-80">
            <Line data={chart} options={options} aria-label={`Historical chart for ${rangeLabel}`} />
        </div>
    );
}
