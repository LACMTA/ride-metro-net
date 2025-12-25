import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import { objectToCamel } from "ts-case-convert";

export interface StopWithRoutes {
  stopName: string;
  stopId: string;
  routes: {
    routeId: string;
    routeShortName: string;
    arrivalTimes: string[];
  }[];
}

export default async function (stopId: string) {
  const db = openDb(GTFSconfig);
  const query = `
SELECT
      stops.stop_name as stop_name, 
      stops.stop_id as stop_id, 
      JSON_GROUP_ARRAY(
        DISTINCT JSON_OBJECT(
          'route_id', routes.route_id,
          'route_short_name', routes.route_short_name,
          'arrival_times', (
            SELECT JSON_GROUP_ARRAY(stop_times.arrival_time) 
            FROM stop_times
            JOIN trips ON trips.trip_id = stop_times.trip_id 
            WHERE stop_times.stop_id = stops.stop_id 
              AND trips.route_id = routes.route_id
          )
        )
      ) AS routes
    FROM stops
    LEFT JOIN stop_times ON stop_times.stop_id = stops.stop_id
    LEFT JOIN trips ON trips.trip_id = stop_times.trip_id
    LEFT JOIN routes ON routes.route_id = trips.route_id
    WHERE stops.stop_id = ?
        `;

  const res = await db.prepare(query).get(stopId);

  const stop = objectToCamel({
    stopName: res.stop_name,
    stopId: res.stop_id,
    routes: JSON.parse(res.routes),
  }) as StopWithRoutes;

  return stop;
}
