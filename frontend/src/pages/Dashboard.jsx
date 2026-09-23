import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RefreshCw } from 'lucide-react';

import { apiSlice } from '../api/apiSlice.js';
import { useGetBoardsQuery } from '../api/boardApi.js';
import {
    useGetBoardLocationsQuery,
    useGetDashboardSummaryQuery,
    useGetLatestReadingQuery,
} from '../api/dashboardApi.js';
import BoardStatusCards from '../components/dashboard/BoardStatusCards.jsx';
import InteractiveMap from '../components/dashboard/InteractiveMap.jsx';
import StationReadingsCards, { StationSelect } from '../components/dashboard/StationReadingsCards.jsx';
import WaterStatusCards from '../components/dashboard/WaterStatusCards.jsx';
import { formatGeneratedAt } from '../components/dashboard/dashboardPresentation.js';
import { activeStations, firstRegisteredStation, stationLabel } from '../components/dashboard/stationPresentation.js';
import { useSocket } from '../hooks/useSocket.js';
import {
    selectConnectionState,
    selectReadingsByBoard,
    selectReceivedCount,
} from '../store/slices/sensorSlice.js';
import { normalizeReading } from '../utils/reading.js';

/**
 * Dashboard page (T-312 page, T-329 counts, T-331 layout, T-336 station cards, T-337 map centre) -
 * `/`, the post-login landing page.
 *
 * Layout, in the order the page reads:
 *
 *   1. **Board Status** - boards Online / Offline (T-329, the requested layout).
 *   2. **Water Quality by Board** - how many active boards are Safe / Acceptable / Not Safe (T-329).
 *   3. **Station Condition** - one station's Water Quality Status, pH, Turbidity, WiFi and
 *      battery, with a picker to change station (T-336).
 *   4. **Board Locations** - the react-leaflet map (2.4), centred on the **first board
 *      registered** (T-337) - the same station block 3 defaults to, so the map and the cards
 *      describe one place.
 *
 * **On the T-331 removals (read before deleting block 3):** T-331 dropped the "Latest Reading"
 * panel (2.2's pH + Turbidity cards and 2.3's Overall Water Status bar) and the "Historical
 * Sensor Data" chart, because they crowded the map. **Block 3 is the user's sanctioned return
 * of those cards** - the placement was decided ("below Water Quality by Board"), which is the
 * condition §7.2 and `ui-requirement.md` §2 set for restoring them. The chart stayed removed
 * and belongs to the Historical page (T-321). The node-condition trio (Water Quality Status,
 * WiFi, battery) and the station picker are new in T-336; the picker replaces the old
 * arrangement in which clicking a map marker was the only way to change the described board.
 *
 * Everything reads `GET /api/dashboard/summary`, `.../boards-locations`, `.../latest/:boardID`
 * (section 6.3) and the board registry (`GET /api/boards`, for the station picker), so
 * **deactivated boards are already excluded** from every count, every marker and every picker
 * option - the browser never filters them itself (A28). When InfluxDB cannot be read the API
 * answers `influxAvailable: false` with `null` numbers and the cards print "—" rather than a
 * confident zero.
 *
 * Live updates (Rule 5) travel Socket.io -> Redux -> this page: the socket reading is overlaid
 * on the marker and on the station cards immediately, and the aggregates are re-queried by
 * invalidating their tag. There is no polling anywhere.
 *
 * 2.1's main heading and subheading are rendered **once** by the global header (T-309), so they
 * are deliberately absent here - and this page renders no `h1`.
 */
/**
 * How many registry rows the station picker asks for - the API's documented maximum
 * (`GET /api/boards?page=&limit=`, 1-100, default 20). The picker must offer every active
 * station, so it requests the ceiling rather than the default page.
 */
const REGISTRY_LIMIT = 100;

export default function Dashboard() {
    // Subscribes to `sensor-update` and feeds the sensor slice. Mounted here rather than in
    // the app shell so the login page never opens a socket connection.
    useSocket();

    const dispatch = useDispatch();
    const connected = useSelector(selectConnectionState);
    const liveByBoard = useSelector(selectReadingsByBoard);
    const receivedCount = useSelector(selectReceivedCount);

    const summary = useGetDashboardSummaryQuery();
    const locations = useGetBoardLocationsQuery();
    const summaryData = summary.data ?? null;

    // The registry, for the station picker and for "the first board registered" (T-336).
    // Asked for at the API's maximum page size (1-100, MASTER_CONTEXT 6.2) so the picker
    // cannot be silently missing a station it should offer.
    const registry = useGetBoardsQuery({ page: 1, limit: REGISTRY_LIMIT });
    const stations = useMemo(() => activeStations(registry.data), [registry.data]);

    /** Markers, with the freshest socket reading overlaid - so a pin recolours instantly. */
    const markers = useMemo(
        () =>
            (locations.data?.data ?? []).map((board) => {
                const live = normalizeReading(liveByBoard[board.boardId]);
                if (!live) return board;

                return {
                    ...board,
                    wqStatus: live.wqStatus ?? board.wqStatus,
                    lastSeen: live.time ?? board.lastSeen,
                    isOnline: true,
                };
            }),
        [locations.data, liveByBoard]
    );

    // The board the page describes: the station cards, the map popup and the header badge all
    // read this one value (T-336 made the station picker a second way to change it, alongside a
    // marker click).
    const [pickedBoardId, setPickedBoardId] = useState(null);

    /**
     * **The first board registered** - the oldest `createdAt` among the active stations (T-336).
     *
     * Two things hang off this single derivation, which is why it is pulled out: it is the
     * station the cards describe by default, and it is where the map centres (T-337). Deriving
     * it once is what keeps the map from opening somewhere other than the station the cards are
     * talking about.
     */
    const homeStation = useMemo(() => firstRegisteredStation(stations), [stations]);

    /**
     * The map's home position, or `null` while the registry is unknown.
     *
     * The API sends coordinates as JSON numbers (T-227), so anything else is refused rather than
     * coerced: `Number(null)` is `0`, and a falsy row would otherwise park the map at `[0, 0]`
     * in the Gulf of Guinea instead of falling back to Pagoh.
     */
    const homeCenter = useMemo(() => {
        if (!homeStation) return null;

        const { latitude, longitude } = homeStation;

        if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

        return [latitude, longitude];
    }, [homeStation]);

    /**
     * Default: the first board registered (above). It is deliberately not the API's list order,
     * which is newest-first, so adding a board cannot change what the page opens on.
     *
     * While the registry is still loading (or if it failed) this falls back to the map's own
     * "active board that reported most recently", so the badge and popup are never blank just
     * because a second query is in flight.
     */
    const defaultBoardId = useMemo(() => {
        if (homeStation) return homeStation.boardId;

        if (markers.length === 0) return null;

        const reporting = markers.filter((board) => board.lastSeen);
        if (reporting.length === 0) return markers[0].boardId;

        return reporting.reduce((newest, board) =>
            new Date(board.lastSeen) > new Date(newest.lastSeen) ? board : newest
        ).boardId;
    }, [homeStation, markers]);

    /**
     * Every board the page can describe, from *either* source - the registry (the picker) and
     * the map (marker clicks, which only carry active boards with coordinates). A selection is
     * validated against the union so it survives the two queries resolving in either order.
     */
    const selectableBoardIds = useMemo(() => {
        const ids = new Set(stations.map((board) => board.boardId));

        for (const marker of markers) ids.add(marker.boardId);

        return ids;
    }, [stations, markers]);

    // A picked board can disappear (deactivated or deleted) - fall back instead of keeping a
    // selection for an id that is no longer offered anywhere on the page.
    const selectedBoardId =
        pickedBoardId && selectableBoardIds.has(pickedBoardId) ? pickedBoardId : defaultBoardId;

    // The registry row for the selected station, for its label and its created-at date. Falls
    // back to the marker, which carries the location name but not the registry columns.
    const selectedStation = useMemo(
        () =>
            stations.find((board) => board.boardId === selectedBoardId) ??
            markers.find((board) => board.boardId === selectedBoardId) ??
            null,
        [stations, markers, selectedBoardId]
    );

    // The click-to-view popup's values (2.4) and the station cards (T-336); fetched for the
    // selected board only, so the page holds one request rather than one per station.
    const latest = useGetLatestReadingQuery(selectedBoardId, { skip: !selectedBoardId });

    /** The best-known reading for any board - the map popup asks for it per marker. */
    function resolveReading(boardId) {
        return (
            normalizeReading(liveByBoard[boardId]) ??
            (boardId === selectedBoardId ? normalizeReading(latest.data?.reading) : null)
        );
    }

    // The station cards: the socket copy when one has arrived (freshest), otherwise the REST
    // reading. `resolveReading` already applies exactly that precedence.
    const stationReading = selectedBoardId ? resolveReading(selectedBoardId) : null;
    const stationReadingIsLive = Boolean(normalizeReading(liveByBoard[selectedBoardId]));

    // A new reading changes the counts and the marker colours, so their tag is invalidated.
    // This is a push, not a poll: the only trigger is the socket event.
    useEffect(() => {
        if (receivedCount === 0) return;

        dispatch(apiSlice.util.invalidateTags(['DashboardSummary']));
    }, [receivedCount, dispatch]);

    const refreshing = summary.isFetching || locations.isFetching;

    return (
        <div className="min-h-full space-y-6 p-6">
            {/* 2.1's heading and subheading live in the global header; this is the live status. */}
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-gray-500">
                        System Status:{' '}
                        <span
                            className={connected ? 'font-semibold text-green-500' : 'font-semibold text-gray-400'}
                            title="Live Socket.io connection to the API - not a board's connectivity"
                        >
                            {connected ? 'Online' : 'Offline'}
                        </span>
                    </p>
                    <p className="text-xs text-gray-400">
                        {summaryData
                            ? `Counts generated ${formatGeneratedAt(summaryData.generatedAt)}`
                            : 'Waiting for the summary…'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            summary.refetch();
                            locations.refetch();
                        }}
                        disabled={refreshing}
                        title="Re-read the counts and markers. Live readings already update over Socket.io - there is no polling."
                        className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>

                    {/* 2.1's board-ID badge. */}
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                        {selectedBoardId ? `Board ${selectedBoardId}` : 'No board reporting yet'}
                    </span>
                </div>
            </header>

            {/* 1. Top row: boards Online / Offline (T-329). */}
            <section aria-labelledby="board-status-heading" className="space-y-3">
                <h2
                    id="board-status-heading"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                >
                    Board Status
                </h2>

                <BoardStatusCards
                    summary={summaryData}
                    isLoading={summary.isLoading}
                    isError={summary.isError}
                    error={summary.error}
                />
            </section>

            {/* 2. Water-quality counts per active board (T-329). */}
            <section aria-labelledby="water-quality-heading" className="space-y-3">
                <h2
                    id="water-quality-heading"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                >
                    Water Quality by Board
                </h2>

                <WaterStatusCards
                    summary={summaryData}
                    isLoading={summary.isLoading}
                    isError={summary.isError}
                    error={summary.error}
                />
            </section>

            {/* 3. One station's live condition (T-336) - the sanctioned return of §2.2's reading
                cards, plus the node-condition trio and a station picker. Placement decided by the
                user: directly below the water-quality counts. */}
            <section aria-labelledby="station-condition-heading" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h2
                        id="station-condition-heading"
                        className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Station Condition
                    </h2>

                    {/* The selection is shared with the map and the header badge, so switching
                        here moves the marker highlight too - and clicking a marker moves this. */}
                    <StationSelect
                        stations={stations}
                        selectedBoardId={selectedBoardId}
                        onSelectStation={setPickedBoardId}
                    />
                </div>

                <StationReadingsCards
                    board={selectedStation}
                    reading={stationReading}
                    readingIsLive={stationReadingIsLive}
                    influxAvailable={latest.data?.influxAvailable ?? null}
                    isLoading={registry.isLoading || latest.isLoading}
                    isError={latest.isError}
                    error={latest.error}
                />
            </section>

            {/* 4. The map (2.4), centred on the first registered station (T-337) - and the main
                element of the page (T-331). */}
            <section aria-labelledby="map-heading" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                        id="map-heading"
                        className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                        Board Locations
                    </h2>
                    <p className="text-xs text-gray-500">
                        {homeStation
                            ? `Centred on ${stationLabel(homeStation)}, the first board registered · click a marker for that board's latest reading`
                            : "Centred on Pagoh, Johor until a board is registered · click a marker for that board's latest reading"}
                    </p>
                </div>

                <InteractiveMap
                    boards={markers}
                    selectedBoardId={selectedBoardId}
                    onSelectBoard={setPickedBoardId}
                    resolveReading={resolveReading}
                    influxAvailable={locations.data?.influxAvailable ?? null}
                    isLoading={locations.isLoading}
                    isError={locations.isError}
                    error={locations.error}
                    homeCenter={homeCenter}
                    homeLabel={stationLabel(homeStation)}
                />
            </section>
        </div>
    );
}
