import { useMemo, useState } from 'react';
import { BarChart3, CalendarRange } from 'lucide-react';

import { useGetBoardsQuery } from '../api/boardApi.js';
import { useGetReadingsQuery, useGetSeriesQuery } from '../api/historicalApi.js';
import ExportButton from '../components/historical/ExportButton.jsx';
import HistoricalChart from '../components/historical/HistoricalChart.jsx';
import ReadingsTable from '../components/historical/ReadingsTable.jsx';
import {
    CHART_METRICS,
    CUSTOM_RANGE,
    DEFAULT_HISTORICAL_RANGE,
    DEFAULT_METRIC_KEYS,
    HISTORICAL_PAGE_SIZES,
    HISTORICAL_RANGES,
    describeWindow,
} from '../components/historical/historicalPresentation.js';
import { describeApiFailure } from '../utils/apiError.js';

/**
 * Historical Data page (T-321 chart, T-322 table, T-323 export) - `/historical`.
 *
 * Composes the three pieces over one filter state, because the chart, the table and the
 * export must always agree on **what** is being looked at:
 *   board (from `GET /api/boards`) · range buttons, or a custom `start`/`end` pair ·
 *   the table's own `page`/`limit`.
 *
 * The API does the work (A27): the chart gets downsampled series (`aggregateWindow`), the
 * table gets one page of stored readings, and the export streams an `exceljs` workbook - the
 * browser never aggregates or builds files.
 *
 * There is no Refresh button and no polling: changing a filter re-queries, RTK Query caches
 * per filter combination, and the readings are historical by nature. `GET /api/boards` is
 * only used to populate the board picker, so a live board-status update is not needed here.
 */
export default function Historical() {
    const [boardId, setBoardId] = useState(null);
    const [range, setRange] = useState(DEFAULT_HISTORICAL_RANGE);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [metrics, setMetrics] = useState(DEFAULT_METRIC_KEYS);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(HISTORICAL_PAGE_SIZES[0]);

    const { data: boardsData, isLoading: boardsLoading } = useGetBoardsQuery({ page: 1, limit: 100 });
    const boards = boardsData?.data ?? [];

    // Default to the first registered board without an effect: the selection is derived, and
    // `selectedBoard` falls back while the list is still loading.
    const selectedBoard = boardId ?? boards[0]?.boardId ?? null;

    const isCustom = range === CUSTOM_RANGE;
    const customReady = !isCustom || (customStart !== '' && customEnd !== '');
    const window = isCustom ? { start: customStart, end: customEnd } : { range };

    const series = useGetSeriesQuery(
        { boardId: selectedBoard, ...window },
        { skip: !selectedBoard || !customReady }
    );

    const readings = useGetReadingsQuery(
        { boardId: selectedBoard, page, limit, ...window },
        { skip: !selectedBoard || !customReady }
    );

    const rangeLabel = useMemo(() => {
        if (isCustom) {
            return customStart && customEnd ? `${customStart} → ${customEnd}` : 'the custom range';
        }

        return HISTORICAL_RANGES.find((option) => option.key === range)?.label ?? range;
    }, [isCustom, customStart, customEnd, range]);

    const windowNote = series.data?.range
        ? describeWindow(series.data.range.window, 'the selected window')
        : null;

    /** Changing a filter resets the table to page 1 - page 3 of a different range is noise. */
    function changeRange(next) {
        setRange(next);
        setPage(1);
    }

    function changeBoard(next) {
        setBoardId(next);
        setPage(1);
    }

    function toggleMetric(key) {
        setMetrics((previous) =>
            previous.includes(key) ? previous.filter((metric) => metric !== key) : [...previous, key]
        );
    }

    return (
        <div className="min-h-full p-6">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Historical Data</h2>
                    <p className="text-sm text-gray-500">
                        Past readings from the registry, charted and downloadable.
                        {windowNote ? ` Chart shows ${windowNote}.` : ''}
                    </p>
                </div>

                {/* The export button is at the top of the table block, as Rule 3 requires -
                    it lives in that card's header below. */}
            </header>

            {boardsLoading ? (
                <p className="text-sm text-gray-500" role="status">
                    Loading boards…
                </p>
            ) : null}

            {!boardsLoading && boards.length === 0 ? (
                <div className="rounded-lg bg-white p-10 text-center shadow-sm">
                    <p className="text-sm text-gray-500">
                        No boards are registered, so there is nothing to chart yet.
                    </p>
                </div>
            ) : null}

            {selectedBoard ? (
                <div className="space-y-6">
                    {/* Filters: board + range + (when custom) the two dates. */}
                    <div className="flex flex-wrap items-end gap-4 rounded-lg bg-white p-4 shadow-sm">
                        <div>
                            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400" htmlFor="history-board">
                                Board
                            </label>
                            <select
                                id="history-board"
                                value={selectedBoard}
                                onChange={(event) => changeBoard(event.target.value)}
                                className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                {boards.map((board) => (
                                    <option key={board.boardId} value={board.boardId}>
                                        {board.boardId} — {board.locationName}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Range</span>
                            <div className="flex flex-wrap gap-1">
                                {HISTORICAL_RANGES.map((option) => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => changeRange(option.key)}
                                        aria-pressed={range === option.key}
                                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                                            range === option.key
                                                ? 'bg-brand-600 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => changeRange(CUSTOM_RANGE)}
                                    aria-pressed={isCustom}
                                    className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
                                        isCustom
                                            ? 'bg-brand-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <CalendarRange className="h-4 w-4" aria-hidden="true" />
                                    Custom
                                </button>
                            </div>
                        </div>

                        {isCustom ? (
                            <div className="flex items-end gap-2">
                                <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400" htmlFor="history-start">
                                        From
                                    </label>
                                    <input
                                        id="history-start"
                                        type="date"
                                        value={customStart}
                                        onChange={(event) => {
                                            setCustomStart(event.target.value);
                                            setPage(1);
                                        }}
                                        className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400" htmlFor="history-end">
                                        To
                                    </label>
                                    <input
                                        id="history-end"
                                        type="date"
                                        value={customEnd}
                                        onChange={(event) => {
                                            setCustomEnd(event.target.value);
                                            setPage(1);
                                        }}
                                        className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {!customReady ? (
                        <p className="rounded-lg bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
                            Pick both dates to see a custom range.
                        </p>
                    ) : null}

                    {customReady ? (
                        <>
                            {/* Chart (4.1) with its series picker. */}
                            <div className="rounded-lg bg-white p-4 shadow-sm">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                        <BarChart3 className="h-4 w-4 text-gray-400" aria-hidden="true" />
                                        {selectedBoard} · {rangeLabel}
                                    </h3>

                                    <div className="flex flex-wrap items-center gap-3">
                                        {CHART_METRICS.map((metric) => (
                                            <label key={metric.key} className="flex items-center gap-1.5 text-sm text-gray-600">
                                                <input
                                                    type="checkbox"
                                                    checked={metrics.includes(metric.key)}
                                                    onChange={() => toggleMetric(metric.key)}
                                                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-purple-500"
                                                />
                                                <span className="inline-flex items-center gap-1">
                                                    <span
                                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                                        style={{ backgroundColor: metric.colour }}
                                                        aria-hidden="true"
                                                    />
                                                    {metric.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <HistoricalChart
                                    series={series.data}
                                    metrics={metrics}
                                    isLoading={series.isLoading}
                                    isError={series.isError}
                                    error={series.error}
                                    rangeLabel={rangeLabel}
                                />
                            </div>

                            {/* Readings table (4.2) - the export button sits at its top (4.3, Rule 3). */}
                            <div className="rounded-lg bg-white shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                                    <h3 className="text-sm font-semibold text-gray-700">Readings</h3>
                                    <ExportButton
                                        boardId={selectedBoard}
                                        range={isCustom ? undefined : range}
                                        start={isCustom ? customStart : undefined}
                                        end={isCustom ? customEnd : undefined}
                                        disabled={readings.isError}
                                    />
                                </div>

                                <ReadingsTable
                                    readings={readings.data}
                                    isLoading={readings.isLoading}
                                    isFetching={readings.isFetching}
                                    isError={readings.isError}
                                    error={readings.error}
                                    page={page}
                                    limit={limit}
                                    onPageChange={setPage}
                                    onLimitChange={(next) => {
                                        setLimit(next);
                                        setPage(1);
                                    }}
                                />
                            </div>
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
