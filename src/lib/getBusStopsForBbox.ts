import { getGtfsDb } from "./gtfsConfig";
import {
  buswayRouteSqlCondition,
  resolveRouteShortName,
} from "./routeShortNameOverrides";
import { buildStopPagesRouteCondition } from "./stopEligibility";
import {
  BUS_STOP_GRID_SIZE,
  BUS_STOP_PREFETCH_TILES,
  gridXForLon,
  gridYForLat,
} from "./busStopTiles";

export interface BusRouteInfo {
  routeId: string;
  routeShortName: string;
  /** GTFS route_type (always 3 for bus, but included for badge logic). */
  routeType: number;
  /** GTFS route_color (hex without `#`), may be empty. */
  routeColor: string;
  /** GTFS route_text_color (hex without `#`), may be empty. */
  routeTextColor: string;
}

export interface BusStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  /** Distinct bus routes serving this stop (excluding busway routes). */
  routes: BusRouteInfo[];
}

interface BusStopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

interface RouteRow {
  stop_id: string;
  route_id: string;
  route_short_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

/**
 * Queries bus stops within a bounding box and enriches each with the distinct
 * bus routes serving it. Uses the same eligibility (`buildStopPagesRouteCondition`)
 * and busway-exclusion logic as the rest of the app so the system map stays
 * 1-1 with built stop pages.
 *
 * @returns Array of {@link BusStop} objects (empty if no qualifying stops).
 */
export function getBusStopsForBbox(
  west: number,
  south: number,
  east: number,
  north: number,
): BusStop[] {
  const db = getGtfsDb();

  // Shared condition: routes from buildStopPages agencies with non-empty
  // route_long_name. Keeps the system map 1-1 with built stop pages.
  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) return [];

  // Exclude busway routes (G / J Line) from the bus-stop route list — those
  // are shown as rail-style stations on the system map.
  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);

  // --- Query 1: qualifying stops in the bounding box ---
  // A stop is included if it has at least one eligible (buildStopPages agency,
  // non-empty route_long_name, non-busway) route serving it.
  const stopRows = db
    .prepare(
      `
      SELECT stop_id, stop_name, stop_lat, stop_lon
      FROM stops
      WHERE stop_lat BETWEEN ? AND ?
        AND stop_lon BETWEEN ? AND ?
        AND (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
        AND EXISTS (
          SELECT 1 FROM stop_times st
          JOIN trips t ON t.trip_id = st.trip_id
          JOIN routes r ON r.route_id = t.route_id
          WHERE st.stop_id = stops.stop_id
            AND ${routeCond.clause}
            AND ${buswayExclude}
        )
      `,
    )
    .all(south, north, west, east, ...routeCond.params) as BusStopRow[];

  if (stopRows.length === 0) return [];

  // --- Query 2: distinct bus routes serving those stops ---
  // Uses idx_stop_times_stop_id for an indexed seek per stop_id. Excludes
  // busway routes since those are rendered as rail-style stations.
  const stopIds = stopRows.map((r) => r.stop_id);
  const placeholders = stopIds.map(() => "?").join(",");

  const routeRows = db
    .prepare(
      `
      SELECT st.stop_id, r.route_id, r.route_short_name, r.route_type, r.route_color, r.route_text_color
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE st.stop_id IN (${placeholders})
        AND ${routeCond.clause}
        AND ${buswayExclude}
      GROUP BY st.stop_id, r.route_id
      `,
    )
    .all(...stopIds, ...routeCond.params) as RouteRow[];

  // --- Merge: group routes by stop_id, dedup by route_short_name ---
  const routesByStop = new Map<string, BusRouteInfo[]>();
  const seenShortNames = new Map<string, Set<string>>();

  for (const row of routeRows) {
    let routes = routesByStop.get(row.stop_id);
    if (!routes) {
      routes = [];
      routesByStop.set(row.stop_id, routes);
      seenShortNames.set(row.stop_id, new Set());
    }
    const shortName = resolveRouteShortName(row.route_id, row.route_short_name);
    const seen = seenShortNames.get(row.stop_id)!;
    if (seen.has(shortName)) continue;
    seen.add(shortName);

    routes.push({
      // Normalize to the stable numeric prefix (e.g. "2-13201" -> "2"),
      // matching RouteWithInfo.routeId and the rest of the app so the nearby
      // lines join (and any future line-page links) resolve correctly.
      routeId: row.route_id.split("-")[0],
      routeShortName: shortName,
      routeType: row.route_type,
      routeColor: row.route_color ?? "",
      routeTextColor: row.route_text_color ?? "",
    });
  }

  return stopRows.map((row) => ({
    stopId: row.stop_id,
    stopName: row.stop_name,
    lat: row.stop_lat,
    lon: row.stop_lon,
    routes: routesByStop.get(row.stop_id) ?? [],
  }));
}

/**
 * Returns all distinct grid-tile keys that contain at least one eligible bus
 * stop. Used by `getStaticPaths` to prerender one JSON file per non-empty tile.
 *
 * Tile keys are `"gridX,gridY"` where `gridX = floor(stop_lon / GRID_SIZE)`
 * and `gridY = floor(stop_lat / GRID_SIZE)`, matching the client's
 * tile-key computation via the shared helpers in `busStopTiles.ts`.
 */
export function getAllBusStopTileKeys(): string[] {
  const db = getGtfsDb();

  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) return [];

  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);

  const rows = db
    .prepare(
      `
      SELECT stop_lat, stop_lon
      FROM stops
      WHERE (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
        AND EXISTS (
          SELECT 1 FROM stop_times st
          JOIN trips t ON t.trip_id = st.trip_id
          JOIN routes r ON r.route_id = t.route_id
          WHERE st.stop_id = stops.stop_id
            AND ${routeCond.clause}
            AND ${buswayExclude}
        )
      `,
    )
    .all(...routeCond.params) as { stop_lat: number; stop_lon: number }[];

  const tileKeys = new Set<string>();
  for (const row of rows) {
    const gridX = gridXForLon(row.stop_lon);
    const gridY = gridYForLat(row.stop_lat);
    tileKeys.add(`${gridX},${gridY}`);
  }

  return [...tileKeys];
}

/**
 * Bounding box covering all eligible bus stops, padded by one tile in each
 * direction to account for the client's prefetch margin. Used to:
 *
 * 1. Generate all tiles (including empty ones) within the service area in
 *    `getStaticPaths`, so no tile inside the service area 404s.
 * 2. Pass to the client so it can skip fetches for tiles outside the area
 *    (e.g. ocean, other counties) without making a request.
 */
export interface ServiceAreaBbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function getBusStopServiceAreaBbox(): ServiceAreaBbox {
  const db = getGtfsDb();

  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) {
    // No eligible agencies — return a zero-size bbox.
    return { minLon: 0, minLat: 0, maxLon: 0, maxLat: 0 };
  }

  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);

  const row = db
    .prepare(
      `
      SELECT
        MIN(stop_lon) AS min_lon,
        MAX(stop_lon) AS max_lon,
        MIN(stop_lat) AS min_lat,
        MAX(stop_lat) AS max_lat
      FROM stops
      WHERE (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
        AND EXISTS (
          SELECT 1 FROM stop_times st
          JOIN trips t ON t.trip_id = st.trip_id
          JOIN routes r ON r.route_id = t.route_id
          WHERE st.stop_id = stops.stop_id
            AND ${routeCond.clause}
            AND ${buswayExclude}
        )
      `,
    )
    .get(...routeCond.params) as {
    min_lon: number;
    max_lon: number;
    min_lat: number;
    max_lat: number;
  };

  // Pad by the prefetch margin so tiles at the edge of the service area
  // are covered when the client prefetches adjacent tiles.
  const padding = BUS_STOP_GRID_SIZE * BUS_STOP_PREFETCH_TILES;

  return {
    minLon: row.min_lon - padding,
    minLat: row.min_lat - padding,
    maxLon: row.max_lon + padding,
    maxLat: row.max_lat + padding,
  };
}

/**
 * Returns all grid-tile keys within the service area bounding box — both
 * tiles with stops and empty tiles. Used by `getStaticPaths` to prerender
 * every tile in the service area so the client never sees a 404 for areas
 * within the service area.
 */
export function getAllBusStopTileKeysInServiceArea(): string[] {
  const bbox = getBusStopServiceAreaBbox();

  const minGridX = gridXForLon(bbox.minLon);
  const maxGridX = gridXForLon(bbox.maxLon);
  const minGridY = gridYForLat(bbox.minLat);
  const maxGridY = gridYForLat(bbox.maxLat);

  const tileKeys: string[] = [];
  for (let gx = minGridX; gx <= maxGridX; gx++) {
    for (let gy = minGridY; gy <= maxGridY; gy++) {
      tileKeys.push(`${gx},${gy}`);
    }
  }

  return tileKeys;
}
