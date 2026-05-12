import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import type Database from "better-sqlite3";

/**
 * GeoJSON `FeatureCollection` of `LineString`s describing every distinct
 * geometry referenced by trips of a given route.
 *
 * Multiple GTFS `shape_id`s often resolve to the exact same ordered list of
 * coordinates, so features here are deduplicated by geometry. Each feature
 * carries the full set of source `shapeIds` and the unique `directionIds`
 * observed for that geometry, so downstream consumers can style or filter by
 * direction / pattern if they wish.
 */
export interface RouteShapesGeoJSON {
  type: "FeatureCollection";
  features: RouteShapeFeature[];
}

export interface RouteShapeFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    /** Array of `[longitude, latitude]` pairs in GeoJSON order. */
    coordinates: [number, number][];
  };
  properties: {
    /** All source `shape_id`s that produced this exact geometry. */
    shapeIds: string[];
    /** Unique `direction_id` values observed for this geometry. */
    directionIds: (number | null)[];
  };
}

interface ShapeIdRow {
  shape_id: string;
  direction_id: number | null;
}

interface ShapePointRow {
  shape_pt_lat: number;
  shape_pt_lon: number;
}

let dbInstance: Database.Database | null = null;
let shapeIdsQuery: Database.Statement | null = null;
let shapePointsQuery: Database.Statement | null = null;

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
 * Selects distinct `(shape_id, direction_id)` pairs for trips of a given
 * route whose `service_id` is currently in service according to GTFS's
 * `calendar` and `calendar_dates` tables.
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
      )
      SELECT DISTINCT t.shape_id, t.direction_id
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.shape_id IS NOT NULL
        AND t.shape_id != ''
        AND t.service_id IN (SELECT service_id FROM active_services)
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

/** In-memory cache — keyed by `routeId|YYYYMMDD` so the active-services
 *  filter naturally refreshes when the service day changes (e.g. on a
 *  long-running dev server). */
const cache = new Map<string, RouteShapesGeoJSON>();

/** Builds a stable string key from a coordinate list for dedupe purposes. */
function geometryKey(coords: [number, number][]): string {
  // Round to ~1cm precision; identical GTFS shapes will match exactly anyway,
  // but this guards against any float noise from the DB driver.
  let out = "";
  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i];
    if (i > 0) out += "|";
    out += lon.toFixed(6) + "," + lat.toFixed(6);
  }
  return out;
}

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
 * Returns a {@link RouteShapesGeoJSON} containing every unique geometry used
 * by trips of the given `routeId` (matching either the exact id or any
 * `routeId-<version>` variant) whose `service_id` is **currently in service**
 * per the GTFS `calendar` and `calendar_dates` tables for today's
 * agency-local date. One `LineString` feature is emitted per distinct
 * geometry, with coordinates ordered by `shape_pt_sequence`.
 *
 * Many GTFS `shape_id`s resolve to identical geometries; those are merged
 * into a single feature whose `properties.shapeIds` lists all source ids and
 * whose `properties.directionIds` lists the unique direction ids observed.
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

  const featuresByGeometry = new Map<string, RouteShapeFeature>();
  const pointsStmt = getShapePointsQuery();

  for (const { shape_id, direction_id } of shapeRows) {
    const points = pointsStmt.all(shape_id) as ShapePointRow[];
    if (points.length < 2) continue;

    const coordinates = points.map(
      (p) => [p.shape_pt_lon, p.shape_pt_lat] as [number, number],
    );
    const key = geometryKey(coordinates);

    const existing = featuresByGeometry.get(key);
    if (existing) {
      if (!existing.properties.shapeIds.includes(shape_id)) {
        existing.properties.shapeIds.push(shape_id);
      }
      if (!existing.properties.directionIds.includes(direction_id)) {
        existing.properties.directionIds.push(direction_id);
      }
      continue;
    }

    featuresByGeometry.set(key, {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {
        shapeIds: [shape_id],
        directionIds: [direction_id],
      },
    });
  }

  const result: RouteShapesGeoJSON = {
    type: "FeatureCollection",
    features: Array.from(featuresByGeometry.values()),
  };

  cache.set(cacheKey, result);
  return result;
}
