import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import { objectToCamel } from "ts-case-convert";
import type Database from "better-sqlite3";

export interface StopWithRoutes {
  stopName: string;
  stopId: string;
  /**
   * For parent stations: the IDs of child stops that actually have scheduled arrivals.
   * Empty array for regular (non-parent) stops.
   * Use these IDs when requesting real-time predictions from Swiftly.
   */
  childStopIds: string[];
  /** Swiftly real-time API agency key, derived from route_type at build time. */
  swiftlyAgencyId: string;
  routes: StopRoute[];
}

export interface StopRoute {
  routeId: string;
  routeShortName: string;
  routeType: number;
  routeColor: string;
  routeTextColor: string;
  headsigns: string[];
  /**
   * 0 or 1 for bus routes (one card per direction).
   * null for rail/tram/subway routes (both directions collapsed into one card).
   */
  directionId: 0 | 1 | null;
}

interface DatabaseQueryResult {
  stop_name: string;
  stop_id: string;
  swiftly_agency_id: string;
  routes: string; // JSON string
}

interface ChildStopRow {
  stop_id: string;
}

let dbInstance: Database.Database | null = null;
let preparedQuery: Database.Statement | null = null;
let preparedChildStopsQuery: Database.Statement | null = null;

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
    WITH
    -- Collect the stop itself plus any child stops (when @stopId is a parent station).
    relevant_stops AS (
      SELECT stop_id FROM stops WHERE stop_id = @stopId
      UNION ALL
      SELECT stop_id FROM stops WHERE parent_station = @stopId
    ),
    -- For bus routes (route_type=3), group by direction so each direction becomes
    -- a separate StopRoute (one card per direction in the UI).
    -- For rail/tram/subway (route_type 0 or 1), collapse both directions into a
    -- single row (direction_id=NULL) so all headsigns appear under one route card.
    route_headsigns AS (
      SELECT
        @stopId AS stop_id,
        routes.route_id,
        routes.route_short_name,
        routes.route_type,
        routes.route_color,
        routes.route_text_color,
        CASE WHEN routes.route_type = 3 THEN 'lametro' ELSE 'lametro-rail' END AS swiftly_agency_id,
        CASE WHEN routes.route_type = 3 THEN trips.direction_id ELSE NULL END AS direction_id,
        MIN(stop_times.stop_sequence) AS min_stop_sequence,
        JSON_GROUP_ARRAY(
          DISTINCT SUBSTR(stop_times.stop_headsign, INSTR(stop_times.stop_headsign, ' - ') + 3)
        ) AS headsigns
      FROM stop_times
      JOIN relevant_stops rs ON rs.stop_id = stop_times.stop_id
      LEFT JOIN trips ON trips.trip_id = stop_times.trip_id
      LEFT JOIN routes ON routes.route_id = trips.route_id
      GROUP BY routes.route_id, routes.route_short_name,
        CASE WHEN routes.route_type = 3 THEN trips.direction_id ELSE NULL END
    )
    SELECT
      stops.stop_name AS stop_name,
      stops.stop_id AS stop_id,
      MIN(route_headsigns.swiftly_agency_id) AS swiftly_agency_id,
      JSON_GROUP_ARRAY(
        JSON_OBJECT(
          'route_id', route_headsigns.route_id,
          'route_short_name', route_headsigns.route_short_name,
          'route_type', route_headsigns.route_type,
          'route_color', COALESCE(route_headsigns.route_color, ''),
          'route_text_color', COALESCE(route_headsigns.route_text_color, ''),
          'direction_id', route_headsigns.direction_id,
          'headsigns', JSON(route_headsigns.headsigns)
        )
      ) AS routes
    FROM stops
    JOIN route_headsigns ON route_headsigns.stop_id = stops.stop_id
    WHERE stops.stop_id = @stopId
      AND NOT EXISTS (
        -- Exclude this direction if another direction for the same route has stop_sequence=1
        SELECT 1
        FROM route_headsigns rh2
        WHERE rh2.route_id = route_headsigns.route_id
          AND rh2.stop_id = route_headsigns.stop_id
          AND rh2.direction_id != route_headsigns.direction_id
          AND rh2.min_stop_sequence = 1
          AND route_headsigns.min_stop_sequence != 1
      )
    GROUP BY stops.stop_id, stops.stop_name;
        `;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

function getPreparedChildStopsQuery() {
  if (!preparedChildStopsQuery) {
    const db = getDb();
    preparedChildStopsQuery = db.prepare(
      `SELECT stop_id FROM stops WHERE parent_station = @stopId`,
    );
  }
  return preparedChildStopsQuery;
}

export default async function (stopId: string) {
  const mainQuery = getPreparedQuery();
  const res = mainQuery.get({ stopId }) as DatabaseQueryResult;

  const childRows = getPreparedChildStopsQuery().all({
    stopId,
  }) as ChildStopRow[];

  const stop: StopWithRoutes = {
    stopName: res.stop_name,
    stopId: res.stop_id,
    childStopIds: childRows.map((r) => r.stop_id),
    swiftlyAgencyId: res.swiftly_agency_id,
    routes: objectToCamel(JSON.parse(res.routes)) as StopRoute[],
  };

  return stop;
}
