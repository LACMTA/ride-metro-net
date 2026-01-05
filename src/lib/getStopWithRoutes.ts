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
  headsign: string;
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
SELECT
      stops.stop_name as stop_name, 
      stops.stop_id as stop_id, 
      JSON_GROUP_ARRAY(
        DISTINCT JSON_OBJECT(
          'route_id', routes.route_id,
          'route_short_name', routes.route_short_name,
          'headsign', SUBSTR(stop_times.stop_headsign, INSTR(stop_times.stop_headsign, ' - ') + 3),
          'direction_id', trips.direction_id
        )
      ) AS routes
    FROM stops
    LEFT JOIN stop_times ON stop_times.stop_id = stops.stop_id
    LEFT JOIN trips ON trips.trip_id = stop_times.trip_id
    LEFT JOIN routes ON routes.route_id = trips.route_id
    WHERE stops.stop_id = ?
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
  const res = query.get(stopId) as DatabaseQueryResult;

  const stop = objectToCamel({
    stopName: res.stop_name,
    stopId: res.stop_id,
    routes: JSON.parse(res.routes),
  }) as StopWithRoutes;

  return stop;
}
