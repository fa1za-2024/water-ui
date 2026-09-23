import L from 'leaflet';

// A18 / T-316: Leaflet's default icon URLs are relative to its stylesheet, so the bundler
// reports `images/marker-icon.png ... didn't resolve at build time` and any *default*
// marker renders as a broken image. Importing the PNGs makes Vite emit real asset URLs,
// and `mergeOptions` points Leaflet's default icon at them.
//
// The dashboard's own markers do NOT use this icon - they are colour-coded `divIcon`s (see
// below), which is what ui-requirement.md 2.4 asks for (green / yellow / red). The fix is
// kept because it is the documented one and it protects every other default-icon use
// (clusters, plugins, a future "you are here" marker) from breaking silently.
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import { waterStatusStyle } from '../../utils/waterStatus.js';

L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

/** Pin geometry. Selected markers are drawn a little larger so the panel's board is obvious. */
const ICON_SIZE = [26, 38];
const SELECTED_ICON_SIZE = [32, 46];

/** Inline SVG teardrop: a filled body in the status colour with a white centre dot. */
function pinSvg(color, { selected }) {
    const ring = selected ? `<circle cx="12" cy="12" r="6.4" fill="none" stroke="${color}" stroke-width="1.6" />` : '';

    return `
        <svg viewBox="0 0 24 36" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 0.8C6.1 0.8 1.3 5.6 1.3 11.5c0 8.1 9.4 22.2 10.1 23.3a0.75 0.75 0 0 0 1.2 0c0.7-1.1 10.1-15.2 10.1-23.3C22.7 5.6 17.9 0.8 12 0.8z"
                  fill="${color}" stroke="#ffffff" stroke-width="1.4" />
            <circle cx="12" cy="11.5" r="4.2" fill="#ffffff" />
            ${ring}
        </svg>`;
}

const iconCache = new Map();

/**
 * A colour-coded marker for one board's current water status.
 *
 * `null` / an unrecognised status gets the neutral grey pin - a board that has never
 * reported must not be painted green, which is the marker-shaped version of A28's
 * "unknown is not zero".
 */
export function statusMarkerIcon(wqStatus, { selected = false } = {}) {
    const key = `${wqStatus ?? 'unknown'}|${selected ? 'sel' : 'std'}`;
    const cached = iconCache.get(key);
    if (cached) return cached;

    const { hex, label } = waterStatusStyle(wqStatus);
    const size = selected ? SELECTED_ICON_SIZE : ICON_SIZE;

    const icon = L.divIcon({
        // An empty class keeps Leaflet's default `leaflet-div-icon` box (white square with
        // a border) out of the way - the SVG is the whole marker.
        className: 'water-ui-marker',
        html: pinSvg(hex, { selected }),
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1] - 2],
        popupAnchor: [0, -size[1] + 6],
        title: label,
    });

    iconCache.set(key, icon);
    return icon;
}
