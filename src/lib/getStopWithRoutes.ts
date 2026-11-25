import { getGtfsDb } from "./gtfsConfig";
import { objectToCamel } from "ts-case-convert";
import type Database from "better-sqlite3";
import { ROUTE_SHORT_NAME_OVERRIDES } from "./routeShortNameOverrides";

export interface StopWithRoutes {
  stopName: string;
  stopId: string;
  /**
   * For parent stations: the IDs of child stops that actually have scheduled arrivals.
   * Empty array for regular (non-parent) stops.
   * Use these IDs when requesting real-time predictions from Swiftly.
   */
  childStopIds: string[];
  routes: StopRoute[];
}

export interface StopRoute {
  routeId: string;
  agencyId: string;
  routeShortName: string;
  routeType: number;
  routeColor: string;
  routeTextColor: string;
  headsigns: string[];
  /** Always 0 or 1 — one card per direction for every route type. */
  directionId: 0 | 1;
  /**
   * The actual child stop_id (platform) that serves this route/direction at
   * a parent station.  For non-parent stops this equals the stop itself.
   * Used to merge rail cards that share a platform.
   */
  childStopId: string;
}

interface DatabaseQueryResult {
  stop_name: string;
  stop_id: string;
  routes: string; // JSON string
}

interface ChildStopRow {
  stop_id: string;
}

interface StopNameRow {
  stop_name: string;
}

let preparedQuery: Database.Statement | null = null;
let preparedChildStopsQuery: Database.Statement | null = null;
let preparedStopNameQuery: Database.Statement | null = null;

const query = `
    WITH
    -- Collect the stop itself plus any child stops (when @stopId is a parent station).
    relevant_stops AS (
      SELECT stop_id FROM stops WHERE stop_id = @stopId
      UNION ALL
      SELECT stop_id FROM stops WHERE parent_station = @stopId
    ),
    -- Materialize the stop_times rows for relevant stops ONCE so that both
    -- headsign_counts and route_headsigns can derive from it without each
    -- scanning the full 3.5M-row stop_times table independently.
    stop_data AS MATERIALIZED (
      SELECT
        stop_times.stop_id,
        stop_times.trip_id,
        stop_times.stop_sequence,
        stop_times.stop_headsign
      FROM stop_times
      JOIN relevant_stops rs ON rs.stop_id = stop_times.stop_id
    ),
    -- Count how many times each processed headsign appears per route/direction
    -- at the relevant stops, so headsigns can be sorted by frequency.
    headsign_counts AS (
      SELECT
        trips.route_id,
        trips.direction_id,
        SUBSTR(stop_data.stop_headsign, INSTR(stop_data.stop_headsign, ' - ') + 3) AS headsign,
        COUNT(*) AS headsign_count
      FROM stop_data
      JOIN trips ON trips.trip_id = stop_data.trip_id
      GROUP BY trips.route_id, trips.direction_id,
        SUBSTR(stop_data.stop_headsign, INSTR(stop_data.stop_headsign, ' - ') + 3)
    ),
    -- Group by direction for every route type — one StopRoute per direction per route.
    route_headsigns AS (
      SELECT
        @stopId AS stop_id,
        routes.route_id,
        routes.agency_id,
        routes.route_short_name,
        routes.route_long_name,
        routes.route_type,
        routes.route_color,
        routes.route_text_color,
        trips.direction_id,
        MIN(stop_data.stop_sequence) AS min_stop_sequence,
        -- 1 if this stop has at least one following stop in any trip for this
        -- route/direction (i.e. not a pure terminus); 0 if always the last stop.
        MAX(CASE
          WHEN stop_data.stop_sequence < (
            SELECT MAX(st2.stop_sequence) FROM stop_times st2
            WHERE st2.trip_id = stop_data.trip_id
          ) THEN 1 ELSE 0
        END) AS has_stops_after,
        -- 1 if any trip of this route/direction continues from this stop to a
        -- downstream stop that allows pickup (a rider boarding here can be
        -- carried somewhere); 0 when every trip either ends here or continues
        -- only to non-passenger layover stops (pickup_type = 1). The bus
        -- filter below uses this to drop "boarding terminus" directions.
        MAX(CASE
          WHEN EXISTS (
            SELECT 1 FROM stop_times s3
            WHERE s3.trip_id = stop_data.trip_id
              AND s3.stop_sequence > stop_data.stop_sequence
              AND COALESCE(s3.pickup_type, 0) != 1
          ) THEN 1 ELSE 0
        END) AS has_pickup_after,
        MIN(stop_data.stop_id) AS child_stop_id,
        (
          SELECT JSON_GROUP_ARRAY(headsign)
          FROM (
            SELECT headsign
            FROM headsign_counts hc
            WHERE hc.route_id = routes.route_id
              AND hc.direction_id = trips.direction_id
            ORDER BY hc.headsign_count DESC, hc.headsign ASC
          )
        ) AS headsigns
      FROM stop_data
      LEFT JOIN trips ON trips.trip_id = stop_data.trip_id
      LEFT JOIN routes ON routes.route_id = trips.route_id
      GROUP BY routes.route_id, routes.agency_id, routes.route_short_name, trips.direction_id
    )
    SELECT
      stops.stop_name AS stop_name,
      stops.stop_id AS stop_id,
      JSON_GROUP_ARRAY(
        JSON_OBJECT(
          'route_id', route_headsigns.route_id,
          'agency_id', route_headsigns.agency_id,
          'route_short_name', route_headsigns.route_short_name,
          'route_type', route_headsigns.route_type,
          'route_color', COALESCE(route_headsigns.route_color, ''),
          'route_text_color', COALESCE(route_headsigns.route_text_color, ''),
          'direction_id', route_headsigns.direction_id,
          'child_stop_id', route_headsigns.child_stop_id,
          'headsigns', JSON(route_headsigns.headsigns)
        )
      ) AS routes
    FROM stops
    JOIN route_headsigns ON route_headsigns.stop_id = stops.stop_id
    WHERE stops.stop_id = @stopId
      AND NOT EXISTS (
        -- For bus routes only, exclude this direction if another direction
        -- for the same route has stop_sequence=1 (i.e. this stop is the
        -- origin for the other direction).
        SELECT 1
        FROM route_headsigns rh2
        WHERE rh2.route_id = route_headsigns.route_id
          AND rh2.stop_id = route_headsigns.stop_id
          AND rh2.direction_id != route_headsigns.direction_id
          AND rh2.min_stop_sequence = 1
          AND route_headsigns.min_stop_sequence != 1
          AND route_headsigns.route_type = 3
      )
      -- Exclude routes with no route_long_name (e.g. event-only express shuttles).
      AND (route_headsigns.route_long_name IS NOT NULL AND route_headsigns.route_long_name != '')
      -- For rail routes, exclude this direction if this stop is always the
      -- terminus (last stop) in that direction — no trains depart from here
      -- in this direction.
      AND NOT (
        route_headsigns.route_type != 3
        AND route_headsigns.has_stops_after = 0
      )
      -- For bus routes, exclude a direction that is a "boarding terminus" at
      -- this stop: every trip either ends here or continues only to
      -- layover-only stops (pickup_type = 1), so riders boarding here cannot
      -- be carried anywhere — its predictions are arrivals of trips ending
      -- here, not departures. Unlike the origin rule above, this also covers
      -- terminus stops where the return direction departs from a different
      -- stop (e.g. route 28 terminates at Vignes/Cesar Chavez but departs
      -- from the opposite corner), which the same-stop origin rule cannot
      -- see.
      AND NOT (
        route_headsigns.route_type = 3
        AND route_headsigns.has_pickup_after = 0
      )
    GROUP BY stops.stop_id, stops.stop_name;
        `;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getGtfsDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

function getPreparedChildStopsQuery() {
  if (!preparedChildStopsQuery) {
    const db = getGtfsDb();
    preparedChildStopsQuery = db.prepare(
      `SELECT DISTINCT stops.stop_id FROM stops INNER JOIN stop_times ON stop_times.stop_id = stops.stop_id WHERE stops.parent_station = @stopId`,
    );
  }
  return preparedChildStopsQuery;
}

function getPreparedStopNameQuery(): Database.Statement {
  if (!preparedStopNameQuery) {
    preparedStopNameQuery = getGtfsDb().prepare(
      `SELECT stop_name FROM stops WHERE stop_id = @stopId`,
    );
  }
  return preparedStopNameQuery;
}

export default async function (stopId: string) {
  const mainQuery = getPreparedQuery();
  const res = mainQuery.get({ stopId }) as DatabaseQueryResult | undefined;

  const childRows = getPreparedChildStopsQuery().all({
    stopId,
  }) as ChildStopRow[];

  // The direction filters can exclude every route a stop serves — e.g. a
  // curbside bus terminus whose only directions are arrival-side (routes
  // 28/33 at Vignes/Cesar Chavez), or a layover-only stop. The main query
  // returns no rows then, so resolve the stop's name separately and return an
  // empty route list rather than crashing callers — the stop page renders its
  // usual shell with no route cards, and the screens/admin callers already
  // treat stops without pairs as empty.
  let stopName: string;
  let routeRows: StopRoute[];
  if (res) {
    stopName = res.stop_name;
    routeRows = objectToCamel(JSON.parse(res.routes)) as StopRoute[];
  } else {
    const stopRow = getPreparedStopNameQuery().get({ stopId }) as
      | StopNameRow
      | undefined;
    if (!stopRow) {
      throw new Error(`No stop found for stopId: ${stopId}`);
    }
    stopName = stopRow.stop_name;
    routeRows = [];
  }

  const routes = routeRows.map((route) => {
    // Normalize routeId to the stable prefix (e.g. "901-13196" → "901")
    route.routeId = route.routeId.split("-")[0];
    if (!route.routeShortName) {
      route.routeShortName =
        ROUTE_SHORT_NAME_OVERRIDES[route.routeId] ?? route.routeShortName;
    }
    return route;
  });

  const stop: StopWithRoutes = {
    stopName,
    stopId: res?.stop_id ?? stopId,
    childStopIds: childRows.map((r) => r.stop_id),
    routes,
  };

  return stop;
}
