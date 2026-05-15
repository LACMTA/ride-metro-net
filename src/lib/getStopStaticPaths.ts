import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";

/**
 * Shared `getStaticPaths` logic for stop pages (`/stops/[stopId]/*`).
 *
 * Builds a path entry for:
 *   1. Stops that have scheduled arrivals (stop_times) and are NOT a child stop.
 *   2. Stops that ARE a parent_station for at least one child stop with arrivals.
 *
 * Does NOT build pages for child stops (those that have a parent_station value),
 * or for parent stations whose children have no stop_times yet (not yet in service).
 */
export async function getStopStaticPaths() {
  const db = openDb(GTFSconfig);
  const allStops = (await db
    .prepare(
      `
      SELECT DISTINCT st.stop_id
      FROM stop_times st
      JOIN stops s ON s.stop_id = st.stop_id
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE (s.parent_station IS NULL OR s.parent_station = '')
        AND r.route_long_name IS NOT NULL AND r.route_long_name != ''

      UNION

      SELECT DISTINCT s.parent_station AS stop_id
      FROM stops s
      INNER JOIN stop_times st ON st.stop_id = s.stop_id
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE s.parent_station IS NOT NULL AND s.parent_station != ''
        AND r.route_long_name IS NOT NULL AND r.route_long_name != ''
      `,
    )
    .all()) as { stop_id: string }[];

  return allStops.map((stop) => ({
    params: { stopId: stop.stop_id },
  }));
}
