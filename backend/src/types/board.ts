/**
 * Boards-module types and the shared shape contract.
 *
 * MASTER_CONTEXT.md section 6.2 (Boards) plus section 4.1's identifier mapping
 * table, extended with the API layer:
 *
 *   | Layer              | Field name                          |
 *   | :----------------- | :---------------------------------- |
 *   | MQTT wire payload  | `boardID`                           |
 *   | MySQL column       | `board_id` (Prisma field `boardId`) |
 *   | InfluxDB tag       | `board_id`                          |
 *   | REST path param    | `:boardID`                          |
 *   | JSON body/response | `boardId` - camelCase, like Prisma  |
 *
 * Rule 1: single-user system, so the table has no owner column and no query is
 * filtered by user. There is no RBAC.
 *
 * Coordinate contract (T-227): Prisma hands back `latitude` / `longitude` as
 * `Prisma.Decimal`, and `res.json()` would serialise those as STRINGS. Every
 * board response goes through `toPublicBoard()`, so the API always emits JSON
 * NUMBERS - the shape `react-leaflet` consumes (Rule 4) - instead of leaking the
 * driver's Decimal representation. The columns are DECIMAL(10,8) / DECIMAL(11,8),
 * which need at most 11 significant digits, and an IEEE-754 double carries ~15,
 * so the conversion is lossless for every value those columns can hold.
 */
import type { BattLevel, WifiStatus } from './sensor';

/**
 * How long a board may stay silent before it counts as Offline.
 *
 * Decided in Appendix A item A5: 15 minutes (the first implementation used 5 and
 * was revised). Mirrored by the frontend's `utils/constants.js` (T-305) - there is
 * no shared package, so the two must be kept in step by hand.
 *
 * Pick this value against the firmware's reporting period: a window shorter than
 * one reporting interval marks every healthy board Offline.
 */
export const BOARD_ONLINE_WINDOW_MINUTES = 15;

/**
 * The status half of a board response - the part that lives in InfluxDB, not MySQL.
 * Every field is nullable because `null` means "not known", which is not the same
 * as "offline".
 */
export interface BoardStatus {
    /** Newest stored point for the board, ISO-8601. `null` = never reported. */
    lastSeen: string | null;
    /** `true`/`false` from the A5 window; `null` = InfluxDB could not be read. */
    isOnline: boolean | null;
    wifiStatus: WifiStatus | null;
    battLevel: BattLevel | null;
}

/**
 * Used when the InfluxDB read fails: the registry still renders, but nothing
 * claims the board is Offline - the API does not know.
 */
export const UNKNOWN_BOARD_STATUS: BoardStatus = {
    lastSeen: null,
    isOnline: null,
    wifiStatus: null,
    battLevel: null,
};

/** What the API returns for a board. Never the raw Prisma row. */
export interface PublicBoard extends BoardStatus {
    id: number;
    boardId: string;
    boardMacAddress: string;
    locationName: string;
    latitude: number;
    longitude: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

/** Prisma `select` that fetches exactly the columns the API exposes. */
export const publicBoardSelect = {
    id: true,
    boardId: true,
    boardMacAddress: true,
    locationName: true,
    latitude: true,
    longitude: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

/** Structural stand-in for `Prisma.Decimal`, so this file needs no generated import. */
interface DecimalLike {
    toNumber(): number;
}

/** Shape produced by `publicBoardSelect`. */
interface BoardRow {
    id: number;
    boardId: string;
    boardMacAddress: string;
    locationName: string;
    latitude: DecimalLike;
    longitude: DecimalLike;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Serialise a board for the API.
 *
 * Dates become ISO-8601 (Rule 7: send ISO, format with Day.js in the UI) and the
 * status half is supplied by the caller - `src/services/influxService.ts` for a
 * real read, `UNKNOWN_BOARD_STATUS` when InfluxDB is unreachable - so this mapper
 * never inspects InfluxDB itself.
 */
export function toPublicBoard(row: BoardRow, status: BoardStatus = UNKNOWN_BOARD_STATUS): PublicBoard {
    return {
        id: row.id,
        boardId: row.boardId,
        boardMacAddress: row.boardMacAddress,
        locationName: row.locationName,
        latitude: row.latitude.toNumber(),
        longitude: row.longitude.toNumber(),
        isActive: row.isActive,
        lastSeen: status.lastSeen,
        isOnline: status.isOnline,
        wifiStatus: status.wifiStatus,
        battLevel: status.battLevel,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/**
 * Logical board id, e.g. `AA240238`.
 *
 * Deliberately case-SENSITIVE and restricted to `[A-Za-z0-9_-]`: this value also
 * travels as the MQTT topic level `sensors/<boardID>/data` and as the InfluxDB
 * `board_id` tag, so a slash, `+`/`#`, or whitespace would break topic matching.
 * It is never case-normalised either - the registry has to match byte-for-byte
 * the `boardID` the firmware prints, or the tag writes and the API lookups stop
 * lining up.
 */
export const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

/** Canonical MAC form: `00:1A:2B:3C:4D:5E` (VARCHAR(17) in section 4.1). */
export const MAC_ADDRESS_PATTERN = /^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/;

/** Documented coordinate ranges (§4.1 / T-206). */
export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;

/** Decimal places of `DECIMAL(10,8)` / `DECIMAL(11,8)`. */
export const COORDINATE_DECIMALS = 8;

/**
 * Snap a coordinate to the precision the column actually stores.
 *
 * `DECIMAL(10,8)` silently rounds extra digits, which would make the stored -
 * and therefore returned - value differ from what the caller sent. Rounding here
 * keeps the response equal to the request (see T-227).
 */
export function roundCoordinate(value: number): number {
    const factor = 10 ** COORDINATE_DECIMALS;
    return Math.round(value * factor) / factor;
}
