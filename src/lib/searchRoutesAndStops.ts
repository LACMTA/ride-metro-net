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
// Eligible-stops temp table
// ---------------------------------------------------------------------------
//
// The stop-eligibility check (buildStopPages agencies + non-empty
// route_long_name + busway exclusion) requires joining stop_times → trips →
// routes for *every* candidate stop. As a correlated EXISTS subquery this is
// O(stops × stop_times) — ~2.3 s for a short LIKE query.
//
// To avoid that, we materialize the set of eligible stop_ids into a per-
// connection temp table once per process lifetime (the DB connection is
// cached in gtfsConfig). Subsequent searches JOIN against this table in
// O(stops) with an index seek, dropping the worst-case query to ~14 ms.

let eligibleStopsReady = false;

/**
 * Creates (if needed) a per-connection temp table of stop_ids that have at
 * least one eligible route, and indexes it. Idempotent — calls after the
 * first are no-ops.
 */
function ensureEligibleStopsTable(db: ReturnType<typeof getGtfsDb>): void {
  if (eligibleStopsReady) return;

  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) {
    eligibleStopsReady = true;
    return;
  }

  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);

  // Drop any stale temp table from a previous (possibly buggy) invocation so
  // the IF NOT EXISTS clause doesn't skip recreating it with fresh data.
  db.exec("DROP TABLE IF EXISTS _eligible_stops;");

  // Build the eligible-stops table with a UNION, matching the pattern in
  // getStopStaticPaths:
  //   1. Platform stops (location_type=0) that have eligible routes.
  //   2. Parent stations (location_type=1) whose child platform stops have
  //      eligible routes — this is how rail stations (e.g. Union Station
  //      80214S) are included, since they don't appear in stop_times
  //      directly but are the stop IDs used for built stop pages.
  // The params are passed twice — once per UNION half.
  db.prepare(
    `
    CREATE TEMP TABLE _eligible_stops AS
      SELECT DISTINCT st.stop_id
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE ${routeCond.clause}
        AND ${buswayExclude}

      UNION

      SELECT DISTINCT s.parent_station AS stop_id
      FROM stops s
      INNER JOIN stop_times st ON st.stop_id = s.stop_id
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE s.parent_station IS NOT NULL AND s.parent_station != ''
        AND ${routeCond.clause}
        AND ${buswayExclude};
  `,
  ).run(...routeCond.params, ...routeCond.params);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx__eligible_stops ON _eligible_stops(stop_id);",
  );

  eligibleStopsReady = true;
}

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
      WHERE r.agency_id IN (${placeholders})
        AND EXISTS (SELECT 1 FROM trips t WHERE t.route_id = r.route_id)
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
 *
 * Handles both bus stops (which appear directly in `stop_times`) and rail
 * parent stations (which do not — their child platform stops do). Parent
 * station IDs are identified by the `S` suffix convention (e.g. `80214S`)
 * and resolved to their child stop IDs for the `stop_times` query.
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

  // Some stop IDs may be parent stations (location_type=1, e.g. rail stations
  // like 80214S). These don't appear in stop_times directly — their child
  // platform stops do. Resolve parent station IDs to their child stop IDs so
  // the route-enrichment query can find their serving routes.
  const parentStationIds = stopIds.filter((id) => id.endsWith("S"));
  const childStopIdMap = new Map<string, string[]>();
  if (parentStationIds.length > 0) {
    const parentPlaceholders = parentStationIds.map(() => "?").join(",");
    const childRows = db
      .prepare(
        `SELECT stop_id, parent_station FROM stops WHERE parent_station IN (${parentPlaceholders})`,
      )
      .all(...parentStationIds) as {
      stop_id: string;
      parent_station: string;
    }[];
    for (const row of childRows) {
      let children = childStopIdMap.get(row.parent_station);
      if (!children) {
        children = [];
        childStopIdMap.set(row.parent_station, children);
      }
      children.push(row.stop_id);
    }
  }

  // Map of stop_times stop_id → original stop row ID (so we can map enriched
  // routes back to the correct BusStop). For bus stops the mapping is identity.
  // For parent stations, all child stop_ids map back to the parent station ID.
  const stopIdToRowId = new Map<string, string>();
  for (const row of stopRows) {
    if (row.stop_id.endsWith("S")) {
      const children = childStopIdMap.get(row.stop_id) ?? [];
      for (const childId of children) {
        stopIdToRowId.set(childId, row.stop_id);
      }
    } else {
      stopIdToRowId.set(row.stop_id, row.stop_id);
    }
  }

  // Collect all stop_ids to query in stop_times (bus stops + child platform
  // stops of any parent stations).
  const stopTimeIds = new Set<string>(
    stopIds.filter((id) => !id.endsWith("S")),
  );
  for (const children of childStopIdMap.values()) {
    for (const childId of children) {
      stopTimeIds.add(childId);
    }
  }
  const stopTimePlaceholders = [...stopTimeIds].map(() => "?").join(",");

  const routeRows = db
    .prepare(
      `
      SELECT st.stop_id, r.route_id, r.route_short_name, r.route_type,
             COALESCE(r.route_color, '') AS route_color,
             COALESCE(r.route_text_color, '') AS route_text_color
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE st.stop_id IN (${stopTimePlaceholders})
        AND ${routeCond.clause}
        AND ${buswayExclude}
      GROUP BY st.stop_id, r.route_id
      `,
    )
    .all(...stopTimeIds, ...routeCond.params) as RouteRow[];

  const routesByStop = new Map<string, BusRouteInfo[]>();
  const seenShortNames = new Map<string, Set<string>>();

  for (const row of routeRows) {
    const rowId = stopIdToRowId.get(row.stop_id) ?? row.stop_id;
    let routes = routesByStop.get(rowId);
    if (!routes) {
      routes = [];
      routesByStop.set(rowId, routes);
      seenShortNames.set(rowId, new Set());
    }
    const shortName = resolveRouteShortName(row.route_id, row.route_short_name);
    const seen = seenShortNames.get(rowId)!;
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

  ensureEligibleStopsTable(db);
  const likeQuery = `%${query.replace(/[%_]/g, (m) => "\\" + m)}%`;

  const stopRows = db
    .prepare(
      `
      SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
      FROM stops s
      JOIN _eligible_stops es ON es.stop_id = s.stop_id
      WHERE (s.location_type IN (0, 1) OR s.location_type IS NULL)
        AND s.parent_station IS NULL
        AND s.stop_name LIKE @like ESCAPE '\\'
      ORDER BY s.stop_name
      LIMIT @limit
      `,
    )
    .all({ like: likeQuery, limit }) as StopSearchRow[];

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

  ensureEligibleStopsTable(db);
  const bbox = getBusStopServiceAreaBbox();

  // Over-fetch by 3x so we have candidates after the eligibility filter, then
  // trim to the requested limit after ordering by distance.
  const fetchLimit = limit * 3;

  const stopRows = db
    .prepare(
      `
      SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
             ((s.stop_lat - @lat) * (s.stop_lat - @lat)
              + (s.stop_lon - @lon) * (s.stop_lon - @lon)) AS dist_sq
      FROM stops s
      JOIN _eligible_stops es ON es.stop_id = s.stop_id
      WHERE (s.location_type IN (0, 1) OR s.location_type IS NULL)
        AND s.parent_station IS NULL
        AND s.stop_lat BETWEEN @south AND @north
        AND s.stop_lon BETWEEN @west AND @east
      ORDER BY dist_sq ASC
      LIMIT @fetchLimit
      `,
    )
    .all({
      lat,
      lon,
      south: bbox.minLat,
      north: bbox.maxLat,
      west: bbox.minLon,
      east: bbox.maxLon,
      fetchLimit,
    }) as (StopSearchRow & { dist_sq: number })[];

  const trimmed = stopRows.slice(0, limit).map(({ dist_sq, ...rest }) => rest);
  return enrichStopsWithRoutes(trimmed, db);
}
