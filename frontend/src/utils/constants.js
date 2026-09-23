/**
 * Cross-cutting frontend constants (T-305).
 *
 * Everything here mirrors a value that the backend already owns. The point of copying
 * them is presentation only (a label, a colour, a map centre) - never a decision. If the
 * two ever disagree, the API response is the truth: the summary carries
 * `onlineWindowMinutes` and `generatedAt` precisely so the UI does not have to guess them.
 */

/**
 * The A5 "Online" window, in minutes - matches `BOARD_ONLINE_WINDOW_MINUTES`
 * (backend/src/types/board.ts, decided as A5 and shown in the summary as
 * `onlineWindowMinutes`). Used for the legend/tooltips, not for deciding anything:
 * `isOnline` arrives computed from `GET /api/boards`, `boards-locations` and
 * `/api/dashboard/latest/:boardID`, so the browser never re-derives it.
 */
export const BOARD_ONLINE_WINDOW_MINUTES = 15;

/**
 * The map's view constants. The dashboard's chart ranges and the historical table's
 * rows-per-page options are deliberately **not** declared here: the dashboard chart was removed
 * at the user's request (T-331) and the table lands with T-322, and a constant nothing reads is
 * one more thing to keep true.
 */

/**
 * Pagoh, Johor, Malaysia (2°10'N 102°46'E) - the deployment area this dashboard covers.
 *
 * Since T-337 this is **no longer the map's centre**: the map opens centred on the **first
 * registered station** (see `firstRegisteredStation()` in the dashboard's
 * `stationPresentation.js`). Pagoh survives as the viewport used for the first paint, before
 * `GET /api/boards` has resolved and there is no station to centre on yet, and as the
 * fallback when no active board is registered at all.
 *
 * Coordinates are Leaflet's `[lat, lng]` order, which is the opposite of the API's
 * `latitude` / `longitude` fields.
 */
export const PAGOH_COORDINATES = [2.1667, 102.7667];

/**
 * The map's default zoom, used for the first paint, for the "First station" reset and for the
 * station-centred view.
 *
 * Deliberately a **regional** zoom rather than a street-level one: centring on a station at
 * zoom 15 would push every other marker off-screen, and a screen that shows one pin reads as
 * boards having gone missing rather than as being zoomed in. The `Malaysia` and `All boards`
 * controls are the escape hatches for going wider.
 */
export const DEFAULT_MAP_ZOOM = 9;

/**
 * The rectangle that covers Malaysia (Peninsular + Sabah/Sarawak) for the "Whole country"
 * view. Handy because the registry can hold boards anywhere while the default view is a
 * single station - without it, a marker outside that station's neighbourhood looks like a
 * missing board.
 */
export const MALAYSIA_BOUNDS = [
    [0.8, 99.5],
    [7.5, 119.4],
];

/** OpenStreetMap tiles - no API key, which is why leaflet is used instead of Mapbox (Rule 4). */
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';
