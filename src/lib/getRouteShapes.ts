import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import type Database from "better-sqlite3";

/**
 * GeoJSON `FeatureCollection` of `LineString`s describing every distinct
 * `shape_id` referenced by trips of a given route.
 *
 * Each feature carries the originating `shapeId` and `directionId` in its
 * `properties` so downstream consumers can style or filter by direction /
 * pattern if they wish.
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
    shapeId: string;
    directionId: number | null;
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

function getShapeIdsQuery() {
  if (!shapeIdsQuery) {
    shapeIdsQuery = getDb().prepare(`
      SELECT DISTINCT t.shape_id, t.direction_id
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.shape_id IS NOT NULL
        AND t.shape_id != ''
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

/** In-memory cache — GTFS data is static for the lifetime of the process. */
const cache = new Map<string, RouteShapesGeoJSON>();

/**
 * Returns a {@link RouteShapesGeoJSON} containing every `shape_id` used by
 * trips of the given `routeId` (matching either the exact id or any
 * `routeId-<version>` variant). One `LineString` feature is emitted per
 * shape, with coordinates ordered by `shape_pt_sequence`.
 *
 * Results are cached in-memory because GTFS data does not change at runtime.
 */
export default function getRouteShapes(routeId: string): RouteShapesGeoJSON {
  const cached = cache.get(routeId);
  if (cached) return cached;

  const shapeRows = getShapeIdsQuery().all({ routeId }) as ShapeIdRow[];

  const features: RouteShapeFeature[] = [];
  const pointsStmt = getShapePointsQuery();

  for (const { shape_id, direction_id } of shapeRows) {
    const points = pointsStmt.all(shape_id) as ShapePointRow[];
    if (points.length < 2) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map(
          (p) => [p.shape_pt_lon, p.shape_pt_lat] as [number, number],
        ),
      },
      properties: {
        shapeId: shape_id,
        directionId: direction_id,
      },
    });
  }

  const result: RouteShapesGeoJSON = {
    type: "FeatureCollection",
    features,
  };

  cache.set(routeId, result);
  return result;
}
