import { getGtfsDb } from "./gtfsConfig";
import {
  resolveRouteShortName,
  buswayRouteSqlCondition,
  ROUTE_SHORT_NAME_OVERRIDES,
} from "./routeShortNameOverrides";
import { getAgencyIdsByFlag, getAgencySettings } from "./agencies";
import { buildStopPagesRouteCondition } from "./stopEligibility";
import type { RouteWithInfo } from "./getRouteById";
import type { BusStop, BusRouteInfo } from "./getBusStopsForBbox";
import { getBusStopServiceAreaBbox } from "./getBusStopsForBbox";

// ---------------------------------------------------------------------------
// Route search
// ---------------------------------------------------------------------------

interface RouteSearchRow {
  agency_id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

/**
 * Searches routes by short name or long name, filtered to `showInAlertsIndex`
 * agencies (same agencies used in the alerts index and system map). Deduplicates
 * by route-ID prefix, matching the pattern used throughout the app.
 *
 * @param query - Search string (at least 2 characters recommended).
 * @param limit - Maximum number of results. Defaults to 50.
 * @returns `RouteWithInfo[]` sorted by short name.
 */
export function searchRoutes(query: string, limit = 50): RouteWithInfo[] {
  const db = getGtfsDb();
  const agencyIds = getAgencyIdsByFlag("showInAlertsIndex");
  const placeholders = agencyIds.map(() => "?").join(", ");
  const likeQuery = `%${query.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const lowerQuery = query.toLowerCase().trim();

  // Rail lines (A–K) have empty route_short_name in raw GTFS; their display
  // names come from ROUTE_SHORT_NAME_OVERRIDES. Build extra SQL OR-conditions
  // to match by route_id prefix when the query contains the letter (e.g.
  // searching "a line" or just "a" should match route_id 801).
  const overrideClauses: string[] = [];
  for (const [prefix, letter] of Object.entries(ROUTE_SHORT_NAME_OVERRIDES)) {
    if (lowerQuery.includes(letter.toLowerCase())) {
      overrideClauses.push(`r.route_id = '${prefix}'`);
      overrideClauses.push(`r.route_id LIKE '${prefix}-%'`);
    }
  }
  const overrideCond =
    overrideClauses.length > 0 ? `OR (${overrideClauses.join(" OR ")})` : "";

  const rows = db
    .prepare(
      `
      SELECT
        r.agency_id,
        r.route_id,
        r.route_short_name,
        r.route_long_name,
        r.route_type,
        COALESCE(r.route_color, '')      AS route_color,
        COALESCE(r.route_text_color, '') AS route_text_color
      FROM routes r
      JOIN trips t ON t.route_id = r.route_id
      WHERE r.agency_id IN (${placeholders})
        AND (r.route_short_name LIKE @like ESCAPE '\\'
             OR r.route_long_name LIKE @like ESCAPE '\\'
             ${overrideCond})
      ORDER BY CAST(r.route_short_name AS INTEGER), r.route_short_name
      LIMIT @limit
      `,
    )
    .all(...agencyIds, {
      like: likeQuery,
      limit,
    }) as RouteSearchRow[];

  const seen = new Set<string>();
  const unique: RouteSearchRow[] = [];
  for (const row of rows) {
    const prefix = row.route_id.split("-")[0];
    if (!seen.has(prefix)) {
      seen.add(prefix);
      unique.push(row);
    }
  }

  return unique.map((row) => {
    const prefix = row.route_id.split("-")[0];
    return {
      routeId: prefix,
      routeShortName: resolveRouteShortName(
        row.route_id,
        row.route_short_name || "",
      ),
      routeLongName: row.route_long_name,
      routeType: row.route_type,
      routeColor: row.route_color,
      routeTextColor: row.route_text_color,
      defaultLineColor: getAgencySettings(row.agency_id)?.lineColor ?? "",
    };
  });
}

// ---------------------------------------------------------------------------
// Stop search
// ---------------------------------------------------------------------------

interface StopSearchRow {
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
 * Shared helper that enriches a list of stop rows with their serving routes.
 * Mirrors the merge logic in `getBusStopsForBbox`: groups routes by stop_id,
 * deduplicates by short name, and returns `BusStop[]`.
 */
function enrichStopsWithRoutes(
  stopRows: StopSearchRow[],
  db: ReturnType<typeof getGtfsDb>,
): BusStop[] {
  if (stopRows.length === 0) return [];

  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) {
    return stopRows.map((row) => ({
      stopId: row.stop_id,
      stopName: row.stop_name,
      lat: row.stop_lat,
      lon: row.stop_lon,
      routes: [],
    }));
  }

  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);
  const stopIds = stopRows.map((r) => r.stop_id);
  const placeholders = stopIds.map(() => "?").join(",");

  const routeRows = db
    .prepare(
      `
      SELECT st.stop_id, r.route_id, r.route_short_name, r.route_type,
             COALESCE(r.route_color, '') AS route_color,
             COALESCE(r.route_text_color, '') AS route_text_color
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
 * Searches stops by name, filtered to stops with at least one qualifying
 * route (same eligibility as `getBusStopsForBbox` / built stop pages).
 *
 * @param query - Search string (at least 2 characters recommended).
 * @param limit - Maximum number of results. Defaults to 30.
 * @returns `BusStop[]` sorted by stop name.
 */
export function searchStops(query: string, limit = 30): BusStop[] {
  const db = getGtfsDb();
  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) return [];

  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);
  const likeQuery = `%${query.replace(/[%_]/g, (m) => "\\" + m)}%`;

  const stopRows = db
    .prepare(
      `
      SELECT stop_id, stop_name, stop_lat, stop_lon
      FROM stops
      WHERE (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
        AND stop_name LIKE @like ESCAPE '\\'
        AND EXISTS (
          SELECT 1 FROM stop_times st
          JOIN trips t ON t.trip_id = st.trip_id
          JOIN routes r ON r.route_id = t.route_id
          WHERE st.stop_id = stops.stop_id
            AND ${routeCond.clause}
            AND ${buswayExclude}
        )
      ORDER BY stop_name
      LIMIT @limit
      `,
    )
    .all({ like: likeQuery, limit }, ...routeCond.params) as StopSearchRow[];

  return enrichStopsWithRoutes(stopRows, db);
}

// ---------------------------------------------------------------------------
// Nearby stops
// ---------------------------------------------------------------------------

/**
 * Finds the nearest stops to a given coordinate, constrained to the bus
 * service area bounding box. Uses a simple squared-distance approximation
 * for ordering (sufficient for "nearest N" at city scale).
 *
 * @param lat - Latitude of the user's location.
 * @param lon - Longitude of the user's location.
 * @param limit - Maximum number of results. Defaults to 30.
 * @returns `BusStop[]` sorted by approximate distance (nearest first).
 */
export function findNearbyStops(
  lat: number,
  lon: number,
  limit = 30,
): BusStop[] {
  const db = getGtfsDb();
  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) return [];

  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);
  const bbox = getBusStopServiceAreaBbox();

  // Over-fetch by 3x so we have candidates after the EXISTS filter, then
  // trim to the requested limit after ordering by distance.
  const fetchLimit = limit * 3;

  const stopRows = db
    .prepare(
      `
      SELECT stop_id, stop_name, stop_lat, stop_lon,
             ((stop_lat - @lat) * (stop_lat - @lat)
              + (stop_lon - @lon) * (stop_lon - @lon)) AS dist_sq
      FROM stops
      WHERE (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
        AND stop_lat BETWEEN @south AND @north
        AND stop_lon BETWEEN @west AND @east
        AND EXISTS (
          SELECT 1 FROM stop_times st
          JOIN trips t ON t.trip_id = st.trip_id
          JOIN routes r ON r.route_id = t.route_id
          WHERE st.stop_id = stops.stop_id
            AND ${routeCond.clause}
            AND ${buswayExclude}
        )
      ORDER BY dist_sq ASC
      LIMIT @fetchLimit
      `,
    )
    .all(
      {
        lat,
        lon,
        south: bbox.minLat,
        north: bbox.maxLat,
        west: bbox.minLon,
        east: bbox.maxLon,
        fetchLimit,
      },
      ...routeCond.params,
    ) as (StopSearchRow & { dist_sq: number })[];

  const trimmed = stopRows.slice(0, limit).map(({ dist_sq, ...rest }) => rest);
  return enrichStopsWithRoutes(trimmed, db);
}
