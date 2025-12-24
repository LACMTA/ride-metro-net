import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import { objectToCamel } from "ts-case-convert";

export interface StopWithRoutes {
  stopName: string;
  stopId: string;
  routeShortNames: string[];
}

export default async function (stopId: string) {
  const db = openDb(GTFSconfig);
  const query = `
SELECT
    stops.stop_name as stop_name, stops.stop_id as stop_id, group_concat( DISTINCT routes.route_short_name) as route_short_names
    FROM stops
    LEFT JOIN stop_times ON stop_times.stop_id = stops.stop_id
    LEFT JOIN trips ON trips.trip_id = stop_times.trip_id
    LEFT JOIN routes ON routes.route_id = trips.route_id
    WHERE stops.stop_id = ?
        `;

  const res = objectToCamel(await db.prepare(query).get(stopId));

  const stop: StopWithRoutes = {
    routeShortNames: res.routeShortNames.split(","),
    stopName: res.stopName,
    stopId: res.stopId,
  };

  return stop;
}
