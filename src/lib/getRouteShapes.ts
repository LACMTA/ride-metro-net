import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import type Database from "better-sqlite3";

/**
 * GeoJSON `FeatureCollection` of `LineString`s — one per `direction_id` —
 * for the most-travelled shape of a given route. May include up to two
 * features per direction: one for core (daytime) service, and, for bus
 * routes (`route_type = 3`) with detectable late-night ("owl") service,
 * one for owl service.
 */
export interface RouteShapesGeoJSON {
  type: "FeatureCollection";
  /**
   * `true` when this route has detectable owl service in addition to its
   * core service today, and at least one owl feature is included in
   * `features`.
   */
  hasOwlService: boolean;
  features: RouteShapeFeature[];
}

export interface RouteStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
}

export interface RouteShapeFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    /** Array of `[longitude, latitude]` pairs in GeoJSON order. */
    coordinates: [number, number][];
  };
  properties: {
    /** The `shape_id` for this direction's representative shape. */
    shapeIds: string[];
    /** The `direction_id` for this shape (wrapped in an array for compatibility). */
    directionIds: (number | null)[];
    /** Ordered list of stops served by this shape's representative trip. */
    stops: RouteStop[];
    /**
     * Which service period this feature represents:
     * - `"core"`: the route's primary daytime service.
     * - `"owl"`: late-night service running on a different routing
     *   (only emitted for bus routes — `route_type = 3` — that have
     *   "owl trips" whose every stop_time falls in `[23:00, 05:00)`
     *   service-day time, and at least one of those trips visits a
     *   stop not on the core routing).
     */
    serviceType: "core" | "owl";
  };
}

interface ShapeIdRow {
  shape_id: string;
  direction_id: number | null;
  trip_count: number;
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
}

// ---------------------------------------------------------------------------
// Database singleton + prepared statements
// ---------------------------------------------------------------------------

let dbInstance: Database.Database | null = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = openDb(GTFSconfig);
    dbInstance.pragma("synchronous = OFF");
    dbInstance.pragma("cache_size = 10000");
    dbInstance.pragma("temp_store = MEMORY");
    dbInstance.pragma("journal_mode = OFF");
  }
  return dbInstance;
}

/**
 * Shared `active_services` CTE used by any query that must filter to trips
 * running on today's service date (`@today`, a `YYYYMMDD` string).
 *
 * A `service_id` qualifies when it either:
 *  - Has a `calendar` row with `start_date <= @today <= end_date`, or
 *  - Has an additive `calendar_dates` row (`exception_type = 1`) for `@today`
 *    (covers services defined exclusively via `calendar_dates`, e.g. holidays).
 */
const ACTIVE_SERVICES_CTE = `
  active_services AS (
    SELECT c.service_id
    FROM calendar c
    WHERE c.start_date <= @today
      AND c.end_date >= @today
    UNION
    SELECT cd.service_id
    FROM calendar_dates cd
    WHERE cd.date = @today AND cd.exception_type = 1
  )`;

/**
 * Lazily-initialised prepared statements. Each entry is populated on first
 * use so the db handle is guaranteed to exist by the time `.prepare()` runs.
 */
const _stmts: Partial<{
  shapeIds: Database.Statement;
  shapePoints: Database.Statement;
  shapeStops: Database.Statement;
  routeType: Database.Statement;
  owlTrips: Database.Statement;
  owlVisitsNonCore: Database.Statement;
  owlShapeIds: Database.Statement;
  owlShapeStops: Database.Statement;
}> = {};

/**
 * For each `direction_id` found among trips of a given route that are
 * currently in service, selects the single `shape_id` used by the most trips
 * (ties broken by `MIN(shape_id)` for determinism).
 *
 * `@today` is a `YYYYMMDD` string matching the format used by
 * `calendar.start_date` / `end_date` and `calendar_dates.date`.
 */
function getShapeIdsQuery() {
  return (_stmts.shapeIds ??= getDb().prepare(`
    WITH ${ACTIVE_SERVICES_CTE},
    shape_counts AS (
      SELECT t.direction_id,
             t.shape_id,
             COUNT(*) AS trip_count
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.shape_id IS NOT NULL
        AND t.shape_id != ''
        AND t.service_id IN (SELECT service_id FROM active_services)
      GROUP BY t.direction_id, t.shape_id
    )
    SELECT sc.direction_id,
           MIN(sc.shape_id) AS shape_id,
           sc.trip_count
    FROM shape_counts sc
    WHERE sc.trip_count = (
      SELECT MAX(sc2.trip_count)
      FROM shape_counts sc2
      WHERE sc2.direction_id IS sc.direction_id
    )
    GROUP BY sc.direction_id, sc.trip_count
  `));
}

function getShapePointsQuery() {
  return (_stmts.shapePoints ??= getDb().prepare(`
    SELECT shape_pt_lat, shape_pt_lon
    FROM shapes
    WHERE shape_id = ?
    ORDER BY shape_pt_sequence ASC
  `));
}

/**
 * Returns the ordered stops for a given `shape_id` by selecting the stops
 * from one representative trip (the lexicographically smallest `trip_id`
 * that uses this shape), in stop-sequence order.
 */
function getShapeStopsQuery() {
  return (_stmts.shapeStops ??= getDb().prepare(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = (
      SELECT MIN(t.trip_id)
      FROM trips t
      WHERE t.shape_id = ?
    )
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    ORDER BY st.stop_sequence ASC
  `));
}

/** `route_type` for a given route id (matching exact id or `-version` variant). */
function getRouteTypeQuery() {
  return (_stmts.routeType ??= getDb().prepare(`
    SELECT route_type
    FROM routes
    WHERE route_id = @routeId OR route_id LIKE @routeId || '-%'
    LIMIT 1
  `));
}

/**
 * Returns the distinct `trip_id`s of "owl trips" for the route: trips on a
 * currently-active service whose *every* `stop_time` falls in the late-
 * night window `[23:00, 05:00)` of the service day. The hour is taken
 * modulo 24 to handle GTFS extended-hour times (e.g. `25:30:00`).
 *
 * Prefers `departure_time` per stop_time, falling back to `arrival_time`
 * when departure is missing/empty.
 */
function getOwlTripsQuery() {
  return (_stmts.owlTrips ??= getDb().prepare(`
    WITH ${ACTIVE_SERVICES_CTE},
    route_trips AS (
      SELECT t.trip_id
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.service_id IN (SELECT service_id FROM active_services)
    )
    SELECT rt.trip_id
    FROM route_trips rt
    WHERE NOT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id = rt.trip_id
        AND (
          -- A stop_time outside [23:00, 05:00) disqualifies the trip.
          (CAST(
            substr(
              COALESCE(NULLIF(st.departure_time, ''), st.arrival_time),
              1,
              instr(COALESCE(NULLIF(st.departure_time, ''), st.arrival_time), ':') - 1
            ) AS INTEGER
          ) % 24) BETWEEN 5 AND 22
        )
    )
  `));
}

/**
 * Returns `1` if any of the supplied owl trips visits at least one stop
 * (in revenue service) that is NOT in the provided core stop set — that
 * is, if the owl trips diverge from the core routing in at least one stop.
 * Returns `0` otherwise.
 */
function getOwlVisitsNonCoreQuery() {
  return (_stmts.owlVisitsNonCore ??= getDb().prepare(`
    SELECT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id IN (SELECT value FROM json_each(@owlTripIdsJson))
        AND (st.pickup_type = 0 OR st.drop_off_type = 0)
        AND st.stop_id NOT IN (SELECT value FROM json_each(@coreStopIdsJson))
    ) AS visits_non_core
  `));
}

/**
 * Same selection logic as {@link getShapeIdsQuery} (most-used `shape_id`
 * per `direction_id`, ties broken by `MIN(shape_id)`), but restricted to
 * the supplied set of owl trip_ids.
 */
function getOwlShapeIdsQuery() {
  return (_stmts.owlShapeIds ??= getDb().prepare(`
    WITH owl_trip_ids AS (
      SELECT value AS trip_id FROM json_each(@owlTripIdsJson)
    ),
    shape_counts AS (
      SELECT t.direction_id,
             t.shape_id,
             COUNT(*) AS trip_count
      FROM trips t
      WHERE t.trip_id IN (SELECT trip_id FROM owl_trip_ids)
        AND t.shape_id IS NOT NULL
        AND t.shape_id != ''
      GROUP BY t.direction_id, t.shape_id
    )
    SELECT sc.direction_id,
           MIN(sc.shape_id) AS shape_id,
           sc.trip_count
    FROM shape_counts sc
    WHERE sc.trip_count = (
      SELECT MAX(sc2.trip_count)
      FROM shape_counts sc2
      WHERE sc2.direction_id IS sc.direction_id
    )
    GROUP BY sc.direction_id, sc.trip_count
  `));
}

/**
 * Returns the ordered stops for a given owl `shape_id`, choosing the
 * representative trip from the supplied set of owl trip_ids only (so that
 * a non-owl trip happening to use the same shape can't be picked). Same
 * service-stop filter as {@link getShapeStopsQuery}.
 */
function getOwlShapeStopsQuery() {
  return (_stmts.owlShapeStops ??= getDb().prepare(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = (
      SELECT MIN(t.trip_id)
      FROM trips t
      WHERE t.shape_id = @shapeId
        AND t.trip_id IN (SELECT value FROM json_each(@owlTripIdsJson))
    )
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    ORDER BY st.stop_sequence ASC
  `));
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** In-memory cache — keyed by `routeId|YYYYMMDD` so the active-services
 *  filter naturally refreshes when the service day changes (e.g. on a
 *  long-running dev server). */
const cache = new Map<string, RouteShapesGeoJSON>();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Returns today's date in the agency's local time zone
 * (`America/Los_Angeles`) as a `YYYYMMDD` string, matching the format used
 * by `calendar.start_date`, `calendar.end_date`, and `calendar_dates.date`.
 *
 * The `"en-CA"` locale formats dates as `YYYY-MM-DD`; stripping hyphens
 * yields the required `YYYYMMDD` in one step.
 */
function getServiceDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  })
    .format(now)
    .replace(/-/g, "");
}

/**
 * Squared Euclidean distance in lon/lat space — sufficient for finding the
 * nearest shape point within the bounds of a single route.
 */
function dist2(
  [lon, lat]: [number, number],
  targetLon: number,
  targetLat: number,
): number {
  return (lon - targetLon) ** 2 + (lat - targetLat) ** 2;
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
 * Builds a `RouteShapeFeature` from a `(shape_id, direction_id)` pair.
 * Returns `null` if the shape has fewer than 2 geometry points (and thus
 * can't form a `LineString`).
 *
 * `getStops` is provided so we can swap in the owl-specific
 * representative-trip selection when building owl features.
 */
function buildFeature(
  shape_id: string,
  direction_id: number | null,
  serviceType: "core" | "owl",
  getStops: (shapeId: string) => StopRow[],
): RouteShapeFeature | null {
  const points = getShapePointsQuery().all(shape_id) as ShapePointRow[];
  if (points.length < 2) return null;

  const allCoords = points.map(
    (p) => [p.shape_pt_lon, p.shape_pt_lat] as [number, number],
  );

  const stops: RouteStop[] = getStops(shape_id).map((s) => ({
    stopId: s.stop_id,
    stopName: s.stop_name,
    lat: s.stop_lat,
    lon: s.stop_lon,
  }));

  // Trim the polyline so it doesn't extend beyond the first and last stops.
  const coordinates = (() => {
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
    return startIdx < endIdx
      ? allCoords.slice(startIdx, endIdx + 1)
      : allCoords;
  })();

  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {
      shapeIds: [shape_id],
      directionIds: [direction_id],
      stops,
      serviceType,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a {@link RouteShapesGeoJSON} with one `LineString` feature per
 * `direction_id` found among currently-active trips of the given `routeId`
 * (matching either the exact id or any `routeId-<version>` variant). The
 * shape chosen for each direction is the one associated with the most trips
 * on today's service date (ties broken by `shape_id` lexicographic order).
 *
 * For bus routes (`route_type = 3`), additional "owl" features (one per
 * direction) are appended when the route has owl service. Owl service is
 * defined here as:
 *
 *  1. The route has one or more **owl trips**: trips on currently-active
 *     services whose *every* `stop_time` is in `[23:00, 05:00)` service-
 *     day time (hour modulo 24 to handle GTFS extended hours).
 *  2. At least one of those owl trips visits a stop (in revenue service)
 *     that is not part of the core routing. This excludes routes whose
 *     late-night trips simply run the core routing at off-hours.
 *
 * When both conditions are met, the owl shapes are computed by the same
 * "most-used shape per direction (ties → `MIN(shape_id)`)" rule, but only
 * over the owl trips, and `hasOwlService` is set to `true`.
 *
 * Results are cached in-memory keyed by `routeId` + today's service date, so
 * the cache rolls over automatically at midnight (Pacific) without needing
 * an explicit invalidation.
 */
export default function getRouteShapes(routeId: string): RouteShapesGeoJSON {
  const today = getServiceDate();
  const cacheKey = `${routeId}|${today}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // ---- Core service: most-used shape per direction. ----
  const shapeRows = getShapeIdsQuery().all({ routeId, today }) as ShapeIdRow[];

  const features: RouteShapeFeature[] = [];
  const coreStopIds = new Set<string>();
  const stopsStmt = getShapeStopsQuery();

  for (const { shape_id, direction_id } of shapeRows) {
    const feature = buildFeature(
      shape_id,
      direction_id,
      "core",
      (sid) => stopsStmt.all(sid) as StopRow[],
    );
    if (!feature) continue;
    for (const s of feature.properties.stops) coreStopIds.add(s.stopId);
    features.push(feature);
  }

  // ---- Owl service detection (bus routes only). ----
  let hasOwlService = false;

  const routeTypeRow = getRouteTypeQuery().get({ routeId }) as
    | { route_type: number }
    | undefined;

  if (routeTypeRow?.route_type === 3 && coreStopIds.size > 0) {
    // 1) Find owl trips: trips whose every stop_time is in [23:00, 05:00).
    const owlTripRows = getOwlTripsQuery().all({
      routeId,
      today,
    }) as { trip_id: string }[];

    if (owlTripRows.length > 0) {
      const owlTripIds = owlTripRows.map((r) => r.trip_id);
      const owlTripIdsJson = JSON.stringify(owlTripIds);
      const coreStopIdsJson = JSON.stringify([...coreStopIds]);

      // 2) Require that owl trips diverge from core routing — i.e., visit
      //    at least one stop (in revenue service) not in the core stop set.
      //    Without this, routes whose late-night trips just run the core
      //    routing at off-hours would be over-tagged with owl features
      //    identical to their core features.
      const visitsRow = getOwlVisitsNonCoreQuery().get({
        owlTripIdsJson,
        coreStopIdsJson,
      }) as { visits_non_core: number } | undefined;

      if (visitsRow?.visits_non_core === 1) {
        // 3) Most-used owl shape per direction, restricted to owl trips.
        const owlShapeRows = getOwlShapeIdsQuery().all({
          owlTripIdsJson,
        }) as ShapeIdRow[];

        const owlStopsStmt = getOwlShapeStopsQuery();
        for (const { shape_id, direction_id } of owlShapeRows) {
          const feature = buildFeature(
            shape_id,
            direction_id,
            "owl",
            (sid) =>
              owlStopsStmt.all({ shapeId: sid, owlTripIdsJson }) as StopRow[],
          );
          if (!feature) continue;
          features.push(feature);
          hasOwlService = true;
        }
      }
    }
  }

  const result: RouteShapesGeoJSON = {
    type: "FeatureCollection",
    hasOwlService,
    features,
  };

  cache.set(cacheKey, result);
  return result;
}
