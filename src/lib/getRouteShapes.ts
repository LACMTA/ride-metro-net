import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import type Database from "better-sqlite3";

/**
 * GeoJSON `FeatureCollection` of `LineString`s — one per `direction_id` —
 * for the most-travelled shape of a given route.
 */
export interface RouteShapesGeoJSON {
  type: "FeatureCollection";
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

let dbInstance: Database.Database | null = null;
let shapeIdsQuery: Database.Statement | null = null;
let shapePointsQuery: Database.Statement | null = null;
let shapeStopsQuery: Database.Statement | null = null;

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
 * For each `direction_id` found among trips of a given route that are
 * currently in service, selects the single `shape_id` used by the most trips
 * (ties broken by `MIN(shape_id)` for determinism).
 *
 * A `service_id` is considered "currently in service" on `@today` when
 * either:
 *
 *  - It has a `calendar` row with `start_date <= @today <= end_date`, or
 *  - It has an additive `calendar_dates` row (`exception_type = 1`) for
 *    `@today` (covering services defined exclusively in `calendar_dates`,
 *    e.g. for holidays).
 *
 * `@today` is a `YYYYMMDD` string matching the format used by
 * `calendar.start_date` / `end_date` and `calendar_dates.date`.
 */
function getShapeIdsQuery() {
  if (!shapeIdsQuery) {
    shapeIdsQuery = getDb().prepare(`
      WITH active_services AS (
        SELECT c.service_id
        FROM calendar c
        WHERE c.start_date <= @today
          AND c.end_date >= @today
        UNION
        SELECT cd.service_id
        FROM calendar_dates cd
        WHERE cd.date = @today AND cd.exception_type = 1
      ),
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
    `);
  }
  return shapeIdsQuery;
}

function getShapePointsQuery() {
  if (!shapePointsQuery) {
    shapePointsQuery = getDb().prepare(`
      SELECT shape_pt_lat, shape_pt_lon
      FROM shapes
      WHERE shape_id = ?
      ORDER BY shape_pt_sequence ASC
    `);
  }
  return shapePointsQuery;
}

/**
 * Returns the ordered stops for a given `shape_id` by selecting the stops
 * from one representative trip (the lexicographically smallest `trip_id`
 * that uses this shape), in stop-sequence order.
 */
function getShapeStopsQuery() {
  if (!shapeStopsQuery) {
    shapeStopsQuery = getDb().prepare(`
      SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
      FROM stop_times st
      JOIN stops s ON s.stop_id = st.stop_id
      WHERE st.trip_id = (
        SELECT MIN(t.trip_id)
        FROM trips t
        WHERE t.shape_id = ?
      )
      ORDER BY st.stop_sequence ASC
    `);
  }
  return shapeStopsQuery;
}

/** In-memory cache — keyed by `routeId|YYYYMMDD` so the active-services
 *  filter naturally refreshes when the service day changes (e.g. on a
 *  long-running dev server). */
const cache = new Map<string, RouteShapesGeoJSON>();

/**
 * Returns today's date in the agency's local time zone
 * (`America/Los_Angeles`) as a `YYYYMMDD` string, matching the format used
 * by `calendar.start_date`, `calendar.end_date`, and `calendar_dates.date`.
 */
function getServiceDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  let year = "";
  let month = "";
  let day = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "day") day = p.value;
  }
  return `${year}${month}${day}`;
}

/**
 * Returns a {@link RouteShapesGeoJSON} with one `LineString` feature per
 * `direction_id` found among currently-active trips of the given `routeId`
 * (matching either the exact id or any `routeId-<version>` variant). The
 * shape chosen for each direction is the one associated with the most trips
 * on today's service date (ties broken by `shape_id` lexicographic order).
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

  const shapeRows = getShapeIdsQuery().all({
    routeId,
    today,
  }) as ShapeIdRow[];

  const pointsStmt = getShapePointsQuery();
  const features: RouteShapeFeature[] = [];

  const stopsStmt = getShapeStopsQuery();

  for (const { shape_id, direction_id } of shapeRows) {
    const points = pointsStmt.all(shape_id) as ShapePointRow[];
    if (points.length < 2) continue;

    const coordinates = points.map(
      (p) => [p.shape_pt_lon, p.shape_pt_lat] as [number, number],
    );

    const stopRows = stopsStmt.all(shape_id) as StopRow[];
    const stops: RouteStop[] = stopRows.map((s) => ({
      stopId: s.stop_id,
      stopName: s.stop_name,
      lat: s.stop_lat,
      lon: s.stop_lon,
    }));

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {
        shapeIds: [shape_id],
        directionIds: [direction_id],
        stops,
      },
    });
  }

  const result: RouteShapesGeoJSON = {
    type: "FeatureCollection",
    features,
  };

  cache.set(cacheKey, result);
  return result;
}
