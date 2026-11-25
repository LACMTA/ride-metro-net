/**
 * Raw-headsign lookup for (route, stop) pairs — the same "route-stop pair"
 * unit `/screens/[signId]` and the screens admin editor work with.
 *
 * `getStopWithRoutes` returns headsigns with their "Line - " prefix stripped,
 * which merges split-line sub-lines: "48 - Melrose - Vine" and
 * "10 - Melrose - Vine" both become "Melrose - Vine". Splitting a split-line
 * route into separate sign rows (via a `route-stop` entry's `headsignFilter`)
 * needs the raw `stop_headsign`, so this module queries it directly — the
 * same `stop_headsign` that `LineMapTripConfig.stopHeadsignFilter` matches
 * against for line maps.
 *
 * Server-only (SQLite via the shared better-sqlite3 connection).
 */
import type Database from "better-sqlite3";
import { getGtfsDb } from "./gtfsConfig";

/** One raw headsign a pair runs under, in one direction. */
export interface PairHeadsignRow {
  /** GTFS `direction_id` (always 0 or 1; NULL coalesced to 0). */
  directionId: 0 | 1;
  /** The full GTFS `stop_headsign`, e.g. "48 - Avalon Station". */
  rawHeadsign: string;
  /** Display text with the "Line - " prefix stripped, e.g. "Avalon Station". */
  headsign: string;
  /** Number of stop_times rows carrying this headsign (frequency ordering). */
  count: number;
}

/** Headsign rows per pair, keyed by `"routeId:stopId"`. */
export type PairHeadsigns = Map<string, PairHeadsignRow[]>;

/** The key a pair is filed under. */
export function pairHeadsignsKey(routeId: string, stopId: string): string {
  return `${routeId}:${stopId}`;
}

interface HeadsignQueryRow {
  direction_id: number | null;
  raw_headsign: string;
  headsign_count: number;
}

let preparedQuery: Database.Statement | null = null;

function getPreparedQuery(): Database.Statement {
  if (!preparedQuery) {
    preparedQuery = getGtfsDb().prepare(`
      SELECT
        COALESCE(t.direction_id, 0) AS direction_id,
        st.stop_headsign AS raw_headsign,
        COUNT(*) AS headsign_count
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND (
          st.stop_id = @stopId
          OR st.stop_id IN (SELECT stop_id FROM stops WHERE parent_station = @stopId)
        )
        AND st.stop_headsign IS NOT NULL
        AND st.stop_headsign != ''
      GROUP BY COALESCE(t.direction_id, 0), st.stop_headsign
      ORDER BY COALESCE(t.direction_id, 0), headsign_count DESC, raw_headsign
    `);
  }
  return preparedQuery;
}

/**
 * Strips the "Line - " prefix from a raw headsign, producing the display text
 * `getStopWithRoutes` and the predictions API use (e.g. "Metro A Line -
 * Pomona Station" → "Pomona Station"). Kept verbatim when the raw headsign
 * has no prefix.
 */
export function displayHeadsignFromRaw(rawHeadsign: string): string {
  const dashIdx = rawHeadsign.indexOf(" - ");
  return dashIdx >= 0 ? rawHeadsign.slice(dashIdx + 3) : rawHeadsign;
}

/**
 * The raw (and processed) headsigns each (route, stop) pair runs under, per
 * direction, frequency-ordered — the same ordering as `getStopWithRoutes`'
 * headsign list. Route IDs match either the bare stable prefix (rail IDs,
 * e.g. "801") or any suffixed GTFS variant (e.g. "10-13201" for "10"), and
 * stops match the stop itself plus any child platforms (parent stations).
 * Pairs absent from the map have no scheduled headsigns (e.g. a route that
 * no longer serves the stop).
 */
export function getPairRawHeadsigns(
  pairs: { routeId: string; stopId: string }[],
): PairHeadsigns {
  const result: PairHeadsigns = new Map();
  if (pairs.length === 0) return result;

  const query = getPreparedQuery();
  for (const { routeId, stopId } of pairs) {
    const key = pairHeadsignsKey(routeId, stopId);
    if (result.has(key)) continue;

    const rows = query.all({ routeId, stopId }) as HeadsignQueryRow[];
    if (rows.length === 0) continue;

    result.set(
      key,
      rows.map((row) => ({
        directionId: (row.direction_id === 1 ? 1 : 0) as 0 | 1,
        rawHeadsign: row.raw_headsign,
        headsign: displayHeadsignFromRaw(row.raw_headsign),
        count: row.headsign_count,
      })),
    );
  }
  return result;
}
