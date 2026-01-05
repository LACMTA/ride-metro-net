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
        JSON_GROUP_ARRAY(
          DISTINCT SUBSTR(stop_times.stop_headsign, INSTR(stop_times.stop_headsign, ' - ') + 3)
        ) as headsigns
      FROM stops
      LEFT JOIN stop_times ON stop_times.stop_id = stops.stop_id
      LEFT JOIN trips ON trips.trip_id = stop_times.trip_id
      LEFT JOIN routes ON routes.route_id = trips.route_id
      WHERE stops.stop_id = @stopId
      GROUP BY stops.stop_id, routes.route_id, routes.route_short_name, trips.direction_id
    )
    SELECT
      stops.stop_name as stop_name, 
      stops.stop_id as stop_id, 
      JSON_GROUP_ARRAY(
        JSON_OBJECT(
          'route_id', route_headsigns.route_id,
          'route_short_name', route_headsigns.route_short_name,
          'direction_id', route_headsigns.direction_id,
          'headsigns', JSON(route_headsigns.headsigns)
        )
      ) AS routes
    FROM stops
    JOIN route_headsigns ON route_headsigns.stop_id = stops.stop_id
    WHERE stops.stop_id = @stopId
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
