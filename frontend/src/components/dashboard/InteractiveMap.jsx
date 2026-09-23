import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Crosshair, Expand, LoaderCircle, Map as MapIcon } from 'lucide-react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';

import { statusMarkerIcon } from './mapIcons.js';
import { formatLastSeen, lastSeenTooltip } from '../boards/boardPresentation.js';
import { formatMeasurement } from '../../utils/reading.js';
import {
    DEFAULT_MAP_ZOOM,
    MALAYSIA_BOUNDS,
    MAP_TILE_ATTRIBUTION,
    MAP_TILE_URL,
    PAGOH_COORDINATES,
} from '../../utils/constants.js';
import { waterStatusLabel, waterStatusStyle } from '../../utils/waterStatus.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * Interactive map (T-315, ui-requirement.md 2.4) - **react-leaflet only** (Rule 4: no
 * Google Maps, no Mapbox).
 *
 * - one marker per **active** board at its `latitude` / `longitude` (the API already
 *   excludes deactivated boards, so a deactivated board is on no marker);
 * - colour-coded 🟢 Safe / 🟡 Acceptable / 🔴 Not Safe, and **grey** when the status is
 *   unknown (`wqStatus: null` - a board that has never reported, or InfluxDB unreadable);
 * - clicking a marker selects the board and opens a popup with `Location Name`,
 *   `Board ID`, the live `pH Level` and `Turbidity`, `Last Seen`, the status pill and a
 *   **"Historical Data"** button that goes to `/historical` (T-332 - it used to say
 *   "View details" and point at the `/boards` registry).
 *
 * **Centring (T-337):** the viewport is centred on the **first registered station** - the
 * `homeCenter` the page passes down - so the opening view and the marker the rest of the page
 * describes are the same place. Pagoh is only the pre-data fallback used before
 * `GET /api/boards` resolves.
 *
 * `MapContainer`'s `center`/`zoom` are read **once**, at mount, so the late-arriving
 * `homeCenter` cannot be honoured by the prop alone - the effect below re-centres when it
 * first becomes known. That is deliberately a one-shot on *change of home* (compared by
 * coordinate, not by array identity): re-centring on every render would drag the map back
 * while the operator is panning it.
 */
export default function InteractiveMap({
    boards = [],
    selectedBoardId,
    onSelectBoard,
    resolveReading,
    influxAvailable,
    isLoading,
    isError,
    error,
    /** `[lat, lng]` of the first registered station, or `null` while it is unknown (T-337). */
    homeCenter = null,
    /** Its display label, for the reset control's tooltip - `AA240238 — Tank 12`. */
    homeLabel = null,
}) {
    const mapRef = useRef(null);

    /** The last position we centred on, as a string - see the note in the docstring. */
    const centredOnRef = useRef(null);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !homeCenter) return;

        const key = `${homeCenter[0]},${homeCenter[1]}`;
        if (centredOnRef.current === key) return;

        // First knowledge of the home station, or a genuine move of it. Either way this runs
        // once per position: a re-render (or a socket-driven refetch that returns the same
        // coordinates) must not yank the map back while the operator is panning it.
        centredOnRef.current = key;
        map.setView(homeCenter, DEFAULT_MAP_ZOOM);
    }, [homeCenter]);

    /** Pagoh only until the registry answers - `homeCenter` wins the moment it exists. */
    const initialCenter = homeCenter ?? PAGOH_COORDINATES;

    /**
     * Height (T-331): the map is the main element of the dashboard now that the reading and chart
     * panels are gone, so it takes most of the viewport - `70vh`, with a floor that keeps it
     * usable on a short screen and a taller floor from `md` up. This replaces 2.4's original
     * `h-64` / `h-96` pair at the user's request.
     */
    return (
        <div className="relative overflow-hidden rounded-lg bg-white shadow-sm">
            {isError ? (
                <p role="alert" className="p-4 text-sm font-medium text-red-600">
                    {describeApiFailure(error, 'Could not load the board locations.')}
                </p>
            ) : (
                <div className="relative">
                    <MapContainer
                        ref={mapRef}
                        center={initialCenter}
                        zoom={DEFAULT_MAP_ZOOM}
                        scrollWheelZoom
                        className="h-[70vh] min-h-[420px] w-full md:min-h-[560px]"
                    >
                        <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} />

                        {boards.map((board) => (
                            <Marker
                                key={board.boardId}
                                position={[board.latitude, board.longitude]}
                                icon={statusMarkerIcon(board.wqStatus, {
                                    selected: board.boardId === selectedBoardId,
                                })}
                                alt={`${board.locationName} (${board.boardId})`}
                                eventHandlers={{ click: () => onSelectBoard?.(board.boardId) }}
                            >
                                <MarkerPopup
                                    board={board}
                                    reading={resolveReading?.(board.boardId) ?? null}
                                />
                            </Marker>
                        ))}
                    </MapContainer>

                    {/* View controls. z-index has to clear Leaflet's panes (400-700), which
                        are positioned inside the map container. */}
                    <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex gap-2">
                        {/* T-337: the reset control follows the map's own centre - the first
                            registered station - instead of a fixed Pagoh coordinate. Disabled
                            when no active board is registered, because there is nowhere to go. */}
                        <button
                            type="button"
                            disabled={!homeCenter}
                            onClick={() => {
                                if (homeCenter) mapRef.current?.flyTo(homeCenter, DEFAULT_MAP_ZOOM);
                            }}
                            className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                                homeCenter
                                    ? `Centre the map on the first registered station${homeLabel ? ` — ${homeLabel}` : ''}`
                                    : 'No active station is registered, so there is nowhere to centre on'
                            }
                        >
                            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                            First station
                        </button>

                        <button
                            type="button"
                            onClick={() => mapRef.current?.flyToBounds(MALAYSIA_BOUNDS, { maxZoom: 9 })}
                            className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200 hover:bg-white"
                            title="Show the whole of Malaysia (Peninsular, Sabah and Sarawak)"
                        >
                            <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Malaysia
                        </button>

                        <button
                            type="button"
                            disabled={boards.length === 0}
                            onClick={() => {
                                const points = boards.map((board) => [board.latitude, board.longitude]);
                                if (points.length === 0) return;
                                mapRef.current?.fitBounds(L.latLngBounds(points).pad(0.25), {
                                    maxZoom: 12,
                                });
                            }}
                            className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow ring-1 ring-gray-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            title="Zoom out to every active board - including any outside Malaysia"
                        >
                            <Expand className="h-3.5 w-3.5" aria-hidden="true" />
                            All boards
                        </button>
                    </div>

                    <Legend />

                    {/* Board count / empty state, so a blank map is never unexplained. */}
                    <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-md bg-white/95 px-3 py-1.5 text-xs text-gray-600 shadow ring-1 ring-gray-200">
                        {isLoading && boards.length === 0
                            ? 'Loading board locations…'
                            : `${boards.length} active board${boards.length === 1 ? '' : 's'} mapped`}
                    </div>

                    {isLoading && boards.length === 0 ? (
                        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-white/60">
                            <p className="flex items-center gap-2 text-sm text-gray-500" role="status">
                                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Loading the map…
                            </p>
                        </div>
                    ) : null}

                    {!isLoading && !isError && boards.length === 0 ? (
                        <div className="absolute inset-0 z-[900] flex flex-col items-center justify-center gap-2 bg-white/80 p-6 text-center">
                            <p className="text-sm font-medium text-gray-600">No active boards to map.</p>
                            <p className="text-xs text-gray-500">
                                Markers appear once a board is registered with coordinates on the{' '}
                                <Link to="/boards" className="font-medium text-brand-600 hover:underline">
                                    Boards
                                </Link>{' '}
                                page. Deactivated boards are never drawn.
                            </p>
                        </div>
                    ) : null}

                    {influxAvailable === false && boards.length > 0 ? (
                        <p className="absolute left-3 top-3 z-[1000] flex max-w-xs items-start gap-1.5 rounded-md bg-amber-50/95 px-2.5 py-1.5 text-xs font-medium text-amber-700 shadow">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            InfluxDB could not be read, so the markers show no water status.
                        </p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

/** The 2.4 click-to-view panel: location, identity, live values, last seen, details link. */
function MarkerPopup({ board, reading }) {
    const status = board.wqStatus ?? null;
    const style = waterStatusStyle(status);
    const lastSeen = reading?.time ?? board.lastSeen ?? null;

    return (
        <Popup>
            <div className="min-w-[190px] space-y-1.5">
                <div>
                    <p className="text-sm font-semibold text-gray-800">{board.locationName}</p>
                    <p className="text-xs text-gray-500">Board {board.boardId}</p>
                </div>

                <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                >
                    {waterStatusLabel(status)}
                </span>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-gray-500">pH Level</dt>
                    <dd className="text-right font-medium text-gray-800">
                        {formatMeasurement(reading?.pH)}
                    </dd>

                    <dt className="text-gray-500">Turbidity</dt>
                    <dd className="text-right font-medium text-gray-800">
                        {formatMeasurement(reading?.turbidity, 2, 'NTU')}
                    </dd>

                    <dt className="text-gray-500">Last Seen</dt>
                    <dd
                        className="text-right font-medium text-gray-800"
                        title={lastSeenTooltip(lastSeen)}
                    >
                        {formatLastSeen(lastSeen) ?? '—'}
                    </dd>
                </dl>

                {/* T-332: the clicked board's *history*, not its configuration - this used to say
                    "View details" and went to the /boards registry. `/historical` is a protected
                    route and currently renders the marked placeholder (T-321..T-323), so this is
                    not a dead end. */}
                <Link
                    to="/historical"
                    className="mt-1 inline-block rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                >
                    Historical Data
                </Link>
            </div>
        </Popup>
    );
}

/** 7.8's legend, rendered over the map so a colour never needs explaining elsewhere. */
function Legend() {
    const entries = ['Safe', 'Acceptable', 'Unsafe'];

    return (
        <ul className="pointer-events-none absolute bottom-3 right-3 z-[1000] space-y-1 rounded-md bg-white/95 px-3 py-2 text-xs text-gray-600 shadow ring-1 ring-gray-200">
            {entries.map((status) => (
                <li key={status} className="flex items-center gap-1.5">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${waterStatusStyle(status).dot}`}
                        aria-hidden="true"
                    />
                    {waterStatusLabel(status)}
                </li>
            ))}
            <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden="true" />
                No data
            </li>
        </ul>
    );
}
