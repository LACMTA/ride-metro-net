import { getGtfsDb } from "./gtfsConfig";
import { getLineMapTripList } from "./getLineMapTrips";
import { getAgencyIdsByFlag } from "./agencies";
import { resolveRouteShortName, isBuswayRoute } from "./routeShortNameOverrides";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Connecting-lines radius configuration
// ---------------------------------------------------------------------------

/**
 * Radius (in meters) for finding nearby stops whose served lines should appear
 * as "connecting lines" at each stop on the route. Tunable: increase to show
 * more nearby connections, decrease to show only same-station connections.
 *
 * At 400 m (~0.25 mi), this catches transfers between closely-spaced bus stops
 * and rail stations without introducing noise from distant unrelated lines.
 */
const CONNECTION_RADIUS_METERS = 200;

/** Meters per degree of latitude — effectively constant worldwide. */
const METERS_PER_DEG_LAT = 111_320;

/** Meters per degree of longitude at LA's average latitude (~34.05° N). */
const METERS_PER_DEG_LON = 111_320 * Math.cos((34.05 * Math.PI) / 180);

/** Haversine great-circle distance between two lat/lon points, in meters. */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GeoJSON `FeatureCollection` of `LineString`s — one per configured trip —
 * for a given route. Each feature contains the shape geometry and ordered
 * stops for the trip identified in the `lineMapTrips.json` config.
 */
export interface RouteShapesGeoJSON {
  type: "FeatureCollection";
  /**
   * `true` when this route has at least one trip configured with
   * `serviceType: "owl"`.
   */
  hasOwlService: boolean;
  /**
   * `true` when this route has at least one trip configured with a
   * `splitLineNumber` property.
   */
  isSplitline: boolean;
  features: RouteShapeFeature[];
}

export interface ConnectingRoute {
  /** Normalized numeric route ID prefix (e.g. "801"). */
  routeId: string;
  /** Resolved display name (e.g. "A" for rail, "720" for bus). */
  routeShortName: string;
  routeType: number;
  routeColor: string;
  routeTextColor: string;
}

/**
 * Sort key for connecting routes, ordering them by mode so that rail lines
 * appear first, then busway lines (G / J), then regular bus lines. Within a
 * mode group, original database order is preserved (stable sort).
 *
 * - Rail: GTFS `route_type != 3` (0 = tram/streetcar, 1 = subway/metro, etc.)
 * - Busway: GTFS `route_type == 3` but operated on a dedicated busway (901, 910)
 * - Bus: everything else (GTFS `route_type == 3`, non-busway)
 */
function connectionSortKey(route: ConnectingRoute): number {
  if (route.routeType !== 3) return 0; // rail
  if (isBuswayRoute(route.routeId)) return 1; // busway
  return 2; // bus
}

export interface RouteStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  /**
   * The parent station ID for this stop, or the stop's own ID when the stop
   * is standalone (no `parent_station`). Used for linking to stop pages,
   * which are generated for parent stops rather than child/platform stops.
   */
  parentStationId: string;
  /**
   * Other Metro lines that serve this stop's parent station (i.e. lines
   * that "intersect" here). Empty when no other line shares the station.
   */
  connections: ConnectingRoute[];
}

export interface RouteShapeFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    /** Array of `[longitude, latitude]` pairs in GeoJSON order. */
    coordinates: [number, number][];
  };
  properties: {
    /** The `shape_id` for this trip's shape. */
    shapeIds: string[];
    /** The `direction_id` for this trip (wrapped in an array for compatibility). */
    directionIds: (number | null)[];
    /** Ordered list of stops served by this trip. */
    stops: RouteStop[];
    /**
     * Which service period this feature represents:
     * - `"core"`: the route's primary daytime service.
     * - `"owl"`: late-night service running on a different routing.
     */
    serviceType: "core" | "owl";
    /**
     * For split-line routes only: the line number (e.g. `"217"` or `"218"`)
     * that this feature belongs to. Absent for non-split-line routes.
     */
    splitLineNumber?: string;
  };
}

interface ShapePointRow {
  shape_pt_lat: number;
  shape_pt_lon: number;
}

interface StopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  parent_station: string | null;
}

interface TripRow {
  shape_id: string;
  direction_id: number | null;
}

interface ConnectionRow {
  parentStationId: string;
  route_id: string;
  route_short_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

interface NearbyConnectionRow extends ConnectionRow {
  nearbyStopLat: number;
  nearbyStopLon: number;
}

// ---------------------------------------------------------------------------
// Polyline trimming utilities
// ---------------------------------------------------------------------------

/**
 * Squared Euclidean distance in lon/lat space — sufficient for finding the
 * nearest shape point within the bounds of a single route.
 */
function dist2(
  coord: [number, number],
  targetLon: number,
  targetLat: number,
): number {
  return (coord[0] - targetLon) ** 2 + (coord[1] - targetLat) ** 2;
}

/**
 * Returns the index of the coordinate in `coords` that is closest to
 * `[targetLon, targetLat]`, scanning from `startAt` toward `endAt`
 * (inclusive, direction determined by sign of `endAt - startAt`).
 */
function nearestIndex(
  coords: [number, number][],
  targetLon: number,
  targetLat: number,
  startAt: number,
  endAt: number,
): number {
  const step = endAt >= startAt ? 1 : -1;
  let bestIdx = startAt;
  let bestDist = Infinity;
  for (let i = startAt; step > 0 ? i <= endAt : i >= endAt; i += step) {
    const d = dist2(coords[i], targetLon, targetLat);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Trims a polyline's coordinates so they don't extend beyond the first and
 * last stops. Finds the nearest shape point to each terminal stop and slices
 * the coordinates array to that range.
 *
 * This is especially important for the split-line mixed-trip fallback, where
 * the full shape covers both sub-lines but only one sub-line's stops are shown.
 */
function trimCoordinates(
  allCoords: [number, number][],
  stops: RouteStop[],
): [number, number][] {
  if (stops.length < 2) return allCoords;
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const startIdx = nearestIndex(
    allCoords,
    firstStop.lon,
    firstStop.lat,
    0,
    allCoords.length - 1,
  );
  const endIdx = nearestIndex(
    allCoords,
    lastStop.lon,
    lastStop.lat,
    allCoords.length - 1,
    0,
  );
  return startIdx < endIdx ? allCoords.slice(startIdx, endIdx + 1) : allCoords;
}

// ---------------------------------------------------------------------------
// Prepared statements (lazily initialised on the shared DB connection)
// ---------------------------------------------------------------------------

const _stmts: Partial<{
  trip: Database.Statement;
  shapePoints: Database.Statement;
  shapeStops: Database.Statement;
  shapeStopsFiltered: Database.Statement;
  connections: Database.Statement;
  nearbyConnections: Database.Statement;
}> = {};

function getTripQuery() {
  return (_stmts.trip ??= getGtfsDb().prepare(`
    SELECT shape_id, direction_id
    FROM trips
    WHERE trip_id = ?
  `));
}

function getShapePointsQuery() {
  return (_stmts.shapePoints ??= getGtfsDb().prepare(`
    SELECT shape_pt_lat, shape_pt_lon
    FROM shapes
    WHERE shape_id = ?
    ORDER BY shape_pt_sequence ASC
  `));
}

/**
 * Returns the ordered stops for a given `trip_id`, in stop-sequence order.
 * Only stops where the trip provides pickup or drop-off service are included.
 */
function getTripStopsQuery() {
  return (_stmts.shapeStops ??= getGtfsDb().prepare(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.parent_station
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = ?
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    ORDER BY st.stop_sequence ASC
  `));
}

/**
 * Like {@link getTripStopsQuery}, but additionally filters to only those
 * stops whose `stop_headsign` contains `@headsignFilter` as a substring.
 * Used for split-line mixed-trip fallback where the trip serves both
 * sub-lines, but only stops belonging to one sub-line should be shown.
 */
function getTripStopsFilteredQuery() {
  return (_stmts.shapeStopsFiltered ??= getGtfsDb().prepare(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.parent_station
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = @tripId
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
      AND st.stop_headsign LIKE '%' || @headsignFilter || '%'
    ORDER BY st.stop_sequence ASC
  `));
}

/**
 * Returns all distinct Metro routes serving any stop under the given parent
 * station IDs. A route "serves" a parent station when it has at least one
 * trip that picks up or drops off at a child stop of that station (or at
 * the standalone stop itself when there is no parent).
 *
 * The `@parentIdsJson` parameter is a JSON array of parent station IDs,
 * passed to SQLite's `json_each()` so the query runs once for an entire
 * route regardless of stop count.
 */
function getConnectionsQuery() {
  // Use named parameters for both inputs — better-sqlite3 does not support
  // mixing named (@) and positional (?) placeholders in one statement.
  return (_stmts.connections ??= getGtfsDb().prepare(`
    WITH parent_ids AS (
      SELECT value AS parent_id FROM json_each(@parentIdsJson)
    ),
    agency_ids AS (
      SELECT value AS agency_id FROM json_each(@agencyIdsJson)
    ),
    relevant_stops AS (
      -- Child stops whose parent_station is in our set
      SELECT s.stop_id, s.parent_station AS parent_id
      FROM stops s
      WHERE s.parent_station IN (SELECT parent_id FROM parent_ids)
      UNION ALL
      -- Standalone stops whose own stop_id is in our set (no parent_station)
      SELECT s.stop_id, s.stop_id AS parent_id
      FROM stops s
      WHERE s.stop_id IN (SELECT parent_id FROM parent_ids)
        AND (s.parent_station IS NULL OR s.parent_station = '')
    )
    SELECT DISTINCT
      rs.parent_id AS parentStationId,
      r.route_id,
      r.route_short_name,
      r.route_type,
      COALESCE(r.route_color, '') AS route_color,
      COALESCE(r.route_text_color, '') AS route_text_color
    FROM relevant_stops rs
    JOIN stop_times st ON st.stop_id = rs.stop_id
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    JOIN trips t ON t.trip_id = st.trip_id
    JOIN routes r ON r.route_id = t.route_id
    WHERE r.agency_id IN (SELECT agency_id FROM agency_ids)
      AND r.route_long_name IS NOT NULL AND r.route_long_name != ''
  `));
}

/**
 * Finds all Metro routes serving stops within a geographic bounding box of
 * each stop on the route. Uses the `idx_stops_latlon` index for a fast
 * range scan, then joins through `stop_times` → `trips` → `routes`.
 *
 * A Haversine post-filter in JS discards stops in the bounding-box corners
 * that are beyond the exact circular radius.
 *
 * The `@stopsJson` parameter is a JSON array of `{ parentId, lat, lon }`
 * objects — one per unique parent station on the route.
 */
function getNearbyConnectionsQuery() {
  return (_stmts.nearbyConnections ??= getGtfsDb().prepare(`
    WITH our_stops AS (
      SELECT
        json_extract(value, '$.parentId') AS parentId,
        json_extract(value, '$.lat')       AS lat,
        json_extract(value, '$.lon')       AS lon
      FROM json_each(@stopsJson)
    ),
    agency_ids AS (
      SELECT value AS agency_id FROM json_each(@agencyIdsJson)
    ),
    nearby_stops AS (
      SELECT DISTINCT
        s.stop_id   AS nearbyStopId,
        s.stop_lat  AS nearbyStopLat,
        s.stop_lon  AS nearbyStopLon,
        os.parentId AS ourParentId
      FROM our_stops os
      JOIN stops s
        ON s.stop_lat BETWEEN os.lat - @radiusLatDeg AND os.lat + @radiusLatDeg
       AND s.stop_lon BETWEEN os.lon - @radiusLonDeg AND os.lon + @radiusLonDeg
    )
    SELECT DISTINCT
      ns.ourParentId   AS parentStationId,
      ns.nearbyStopLat,
      ns.nearbyStopLon,
      r.route_id,
      r.route_short_name,
      r.route_type,
      COALESCE(r.route_color, '') AS route_color,
      COALESCE(r.route_text_color, '') AS route_text_color
    FROM nearby_stops ns
    JOIN stop_times st ON st.stop_id = ns.nearbyStopId
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    JOIN trips t ON t.trip_id = st.trip_id
    JOIN routes r ON r.route_id = t.route_id
    WHERE r.agency_id IN (SELECT agency_id FROM agency_ids)
      AND r.route_long_name IS NOT NULL AND r.route_long_name != ''
  `));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a `RouteShapesGeoJSON` for the given route by looking up the
 * canonical trip IDs from the `lineMapTrips.json` config and querying the
 * database for each trip's shape geometry and ordered stops.
 *
 * @param routeId Numeric route ID prefix (e.g. "801", "720").
 * @returns GeoJSON FeatureCollection, or `null` if no config exists.
 */
export default function getRouteShapes(
  routeId: string,
): RouteShapesGeoJSON | null {
  const trips = getLineMapTripList(routeId);
  if (!trips || trips.length === 0) {
    return null;
  }

  const tripQuery = getTripQuery();
  const shapePointsQuery = getShapePointsQuery();
  const tripStopsQuery = getTripStopsQuery();
  const tripStopsFilteredQuery = getTripStopsFilteredQuery();

  const features: RouteShapeFeature[] = [];
  let hasOwlService = false;
  let isSplitline = false;

  // Collect all unique parent station IDs across every trip so we can
  // resolve connecting lines in a single query after the loop.
  const allParentIds = new Set<string>();

  // Collect one representative coordinate per parent station for the
  // radius-based nearby-stop query.
  const stopCoords = new Map<string, { lat: number; lon: number }>();

  for (const tripConfig of trips) {
    const tripRow = tripQuery.get(tripConfig.tripId) as TripRow | undefined;
    if (!tripRow || !tripRow.shape_id) {
      continue;
    }

    const shapePoints = shapePointsQuery.all(
      tripRow.shape_id,
    ) as ShapePointRow[];
    if (shapePoints.length === 0) {
      continue;
    }

    const stops = tripConfig.stopHeadsignFilter
      ? (tripStopsFilteredQuery.all({
          tripId: tripConfig.tripId,
          headsignFilter: tripConfig.stopHeadsignFilter,
        }) as StopRow[])
      : (tripStopsQuery.all(tripConfig.tripId) as StopRow[]);

    const serviceType = tripConfig.serviceType ?? "core";
    if (serviceType === "owl") hasOwlService = true;
    if (tripConfig.splitLineNumber) isSplitline = true;

    const allCoords = shapePoints.map(
      (p) => [p.shape_pt_lon, p.shape_pt_lat] as [number, number],
    );
    const routeStops = stops.map((s) => {
      const parentStationId = s.parent_station || s.stop_id;
      allParentIds.add(parentStationId);
      if (!stopCoords.has(parentStationId)) {
        stopCoords.set(parentStationId, { lat: s.stop_lat, lon: s.stop_lon });
      }
      return {
        stopId: s.stop_id,
        stopName: s.stop_name,
        lat: s.stop_lat,
        lon: s.stop_lon,
        parentStationId,
        // Placeholder — populated after the connecting-routes query below.
        connections: [] as ConnectingRoute[],
      };
    });

    // Trim the polyline to match the first and last stops. This ensures the
    // shape doesn't extend beyond the terminal stops — important for
    // split-line routes (both mixed-trip fallback and dedicated-trip variants)
    // where the full shape may cover a longer path than the displayed stops.
    const coordinates = trimCoordinates(allCoords, routeStops);

    const feature: RouteShapeFeature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {
        shapeIds: [tripRow.shape_id],
        directionIds: [tripRow.direction_id],
        stops: routeStops,
        serviceType,
        ...(tripConfig.splitLineNumber && {
          splitLineNumber: tripConfig.splitLineNumber,
        }),
      },
    };

    features.push(feature);
  }

  // -----------------------------------------------------------------------
  // Resolve connecting lines: for each parent station, find all other Metro
  // lines that serve any stop under that parent. The current route is then
  // filtered out in JS.
  // -----------------------------------------------------------------------
  // Compute agency IDs once and reuse for both connection queries.
  const agencyIdsJson = JSON.stringify(getAgencyIdsByFlag("buildLinePages"));

  const connectionsByParent = buildConnectionsMap(
    getConnectionsQuery(),
    allParentIds,
    agencyIdsJson,
  );

  // Merge in radius-based nearby-stop connections (lines serving stops
  // within CONNECTION_RADIUS_METERS of each stop on the route).
  mergeNearbyConnections(
    connectionsByParent,
    getNearbyConnectionsQuery(),
    stopCoords,
    agencyIdsJson,
  );

  const routeIdPrefix = routeId.split("-")[0];

  for (const feature of features) {
    for (const stop of feature.properties.stops) {
      const all = connectionsByParent.get(stop.parentStationId);
      if (all) {
        stop.connections = all
          .filter((c) => c.routeId !== routeIdPrefix)
          .sort((a, b) => connectionSortKey(a) - connectionSortKey(b));
      }
    }
  }

  return {
    type: "FeatureCollection",
    hasOwlService,
    isSplitline,
    features,
  };
}

/**
 * Runs the connecting-routes query for a set of parent station IDs and
 * returns a `Map<parentStationId, ConnectingRoute[]>` with route IDs
 * normalized to their stable numeric prefix and short names resolved.
 */
function buildConnectionsMap(
  stmt: Database.Statement,
  parentIds: Set<string>,
  agencyIdsJson: string,
): Map<string, ConnectingRoute[]> {
  const map = new Map<string, ConnectingRoute[]>();
  if (parentIds.size === 0) return map;

  const rows = stmt.all({
    parentIdsJson: JSON.stringify([...parentIds]),
    agencyIdsJson,
  }) as ConnectionRow[];

  // Deduplicate by (parentStationId, numeric routeId prefix) since a route
  // may appear under multiple versioned route_ids at the same station.
  const seen = new Set<string>();
  for (const row of rows) {
    const prefix = row.route_id.split("-")[0];
    const dedupeKey = `${row.parentStationId}:${prefix}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const route: ConnectingRoute = {
      routeId: prefix,
      routeShortName: resolveRouteShortName(
        row.route_id,
        row.route_short_name || "",
      ),
      routeType: row.route_type,
      routeColor: row.route_color,
      routeTextColor: row.route_text_color,
    };
    let list = map.get(row.parentStationId);
    if (!list) {
      list = [];
      map.set(row.parentStationId, list);
    }
    list.push(route);
  }

  return map;
}

/**
 * Runs the nearby-stop connecting-routes query and merges results into the
 * existing `connectionsByParent` map. Uses a Haversine post-filter to discard
 * stops in the bounding-box corners that are beyond the exact radius.
 *
 * Routes already present (from the parent-station query) are not duplicated.
 */
function mergeNearbyConnections(
  map: Map<string, ConnectingRoute[]>,
  stmt: Database.Statement,
  stopCoords: Map<string, { lat: number; lon: number }>,
  agencyIdsJson: string,
): void {
  if (stopCoords.size === 0) return;

  const radiusLatDeg = CONNECTION_RADIUS_METERS / METERS_PER_DEG_LAT;
  const radiusLonDeg = CONNECTION_RADIUS_METERS / METERS_PER_DEG_LON;

  const stopsJson = JSON.stringify(
    [...stopCoords.entries()].map(([parentId, coords]) => ({
      parentId,
      lat: coords.lat,
      lon: coords.lon,
    })),
  );

  const rows = stmt.all({
    stopsJson,
    agencyIdsJson,
    radiusLatDeg,
    radiusLonDeg,
  }) as NearbyConnectionRow[];

  // Track (parentStationId, routeId prefix) pairs already confirmed so we
  // don't add the same route twice or re-check distant occurrences.
  const confirmed = new Set<string>();

  for (const row of rows) {
    const prefix = row.route_id.split("-")[0];
    const dedupeKey = `${row.parentStationId}:${prefix}`;
    if (confirmed.has(dedupeKey)) continue;

    // Skip if already present from the parent-station query.
    const existing = map.get(row.parentStationId);
    if (existing && existing.some((r) => r.routeId === prefix)) {
      confirmed.add(dedupeKey);
      continue;
    }

    // Haversine post-filter: discard stops outside the exact radius.
    const ourCoords = stopCoords.get(row.parentStationId);
    if (!ourCoords) continue;
    const dist = haversineMeters(
      ourCoords.lat,
      ourCoords.lon,
      row.nearbyStopLat,
      row.nearbyStopLon,
    );
    if (dist > CONNECTION_RADIUS_METERS) continue;

    confirmed.add(dedupeKey);

    const route: ConnectingRoute = {
      routeId: prefix,
      routeShortName: resolveRouteShortName(
        row.route_id,
        row.route_short_name || "",
      ),
      routeType: row.route_type,
      routeColor: row.route_color,
      routeTextColor: row.route_text_color,
    };
    let list = map.get(row.parentStationId);
    if (!list) {
      list = [];
      map.set(row.parentStationId, list);
    }
    list.push(route);
  }
}
