import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import { objectToCamel } from "ts-case-convert";
import type Database from "better-sqlite3";

export interface StopWithRoutes {
  stopName: string;
  stopId: string;
  routes: StopRoute[];
}

export interface StopRoute {
  routeId: string;
  routeShortName: string;
  headsigns: string[];
  directionId: 0 | 1;
}

interface DatabaseQueryResult {
  stop_name: string;
  stop_id: string;
  routes: string; // JSON string
}

let dbInstance: Database.Database | null = null;
let preparedQuery: Database.Statement | null = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = openDb(GTFSconfig);

    dbInstance.pragma("synchronous = OFF");
    dbInstance.pragma("cache_size = 10000");
    dbInstance.pragma("temp_store = MEMORY");
    dbInstance.pragma("journal_mode = OFF"); // Safe for in-memory
  }
  return dbInstance;
}

const query = `
    WITH route_headsigns AS (
      SELECT 
        stops.stop_id,
        routes.route_id,
        routes.route_short_name,
        trips.direction_id,
        MIN(stop_times.stop_sequence) as min_stop_sequence,
        JSON_GROUP_ARRAY(
          DISTINCT SUBSTR(stop_times.stop_headsign, INSTR(stop_times.stop_headsign, ' - ') + 3)
        ) as headsigns
      FROM stops
      LEFT JOIN stop_times ON stop_times.stop_id = stops.stop_id
      LEFT JOIN trips ON trips.trip_id = stop_times.trip_id
      LEFT JOIN routes ON routes.route_id = trips.route_id
      WHERE stops.stop_id = @stopId
      GROUP BY stops.stop_id, routes.route_id, routes.route_short_name, trips.direction_id
    ),
    filtered_routes AS (
      -- For each route_id, keep only the direction with the minimum stop_sequence
      -- This eliminates duplicates at termini, but may cause problems elsewhere
      SELECT 
        *,
        ROW_NUMBER() OVER (
          PARTITION BY stop_id, route_id 
          ORDER BY min_stop_sequence ASC
        ) as sequence_rank
      FROM route_headsigns
    )
    SELECT
      stops.stop_name as stop_name, 
      stops.stop_id as stop_id, 
      JSON_GROUP_ARRAY(
        JSON_OBJECT(
          'route_id', filtered_routes.route_id,
          'route_short_name', filtered_routes.route_short_name,
          'direction_id', filtered_routes.direction_id,
          'headsigns', JSON(filtered_routes.headsigns)
        )
      ) AS routes
    FROM stops
    JOIN filtered_routes ON filtered_routes.stop_id = stops.stop_id
    WHERE stops.stop_id = @stopId 
      AND filtered_routes.sequence_rank = 1  -- Only keep the direction with minimum stop_sequence
    GROUP BY stops.stop_id, stops.stop_name;
        `;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

export default async function (stopId: string) {
  const query = getPreparedQuery();
  const res = query.get({ stopId }) as DatabaseQueryResult;

  const stop = objectToCamel({
    stopName: res.stop_name,
    stopId: res.stop_id,
    routes: JSON.parse(res.routes),
  }) as StopWithRoutes;

  return stop;
}
