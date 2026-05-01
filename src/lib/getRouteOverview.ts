import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import type Database from "better-sqlite3";

/** A pair of GTFS time strings (e.g. "05:30:00", "24:45:00") representing
 *  the first and last scheduled service on the line. Either value may be null
 *  if the route does not operate on that day type. */
export interface ServiceTimes {
  /** Earliest departure time across all stops and trips, e.g. "04:52:00" */
  first: string | null;
  /** Latest departure time across all stops and trips — may exceed 24 h for
   *  post-midnight trips, e.g. "25:42:00" */
  last: string | null;
}

/**
 * High-level schedule overview for a route:
 * - the stop names for the two terminal stops (first and last of direction 0)
 * - the first and last service time across the entire line on weekdays and weekends
 */
export interface RouteOverview {
  firstStopId: string;
  firstStopName: string;
  lastStopId: string;
  lastStopName: string;
  /** Total number of unique stops served by the route. */
  stopCount: number;
  weekday: ServiceTimes;
  weekend: ServiceTimes;
}

interface OverviewRow {
  first_stop_id: string;
  first_stop_name: string;
  last_stop_id: string;
  last_stop_name: string;
  stop_count: number;
  weekday_first: string | null;
  weekday_last: string | null;
  weekend_first: string | null;
  weekend_last: string | null;
}

let dbInstance: Database.Database | null = null;
let preparedQuery: Database.Statement | null = null;

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
 * Single CTE query that:
 *  1. Collects all trips for the route (matching exact route_id or "routeId-%" prefix).
 *  2. Splits them into weekday trips (Mon–Fri) and weekend trips (Sat or Sun) via the
 *     calendar table.
 *  3. Picks a canonical direction-0 trip to determine the first and last terminal stop names.
 *  4. Returns the earliest and latest departure_time across ALL stops and trips for each
 *     day type — i.e. the line's overall operating window.
 *
 * Times are returned as raw GTFS strings ("HH:MM:SS") and may exceed 24 h for
 * post-midnight service (e.g. "25:42:00").
 */
const query = `
  WITH route_trips AS (
    SELECT t.trip_id, t.service_id, t.direction_id
    FROM trips t
    JOIN routes r ON r.route_id = t.route_id
    WHERE r.route_id = @routeId
       OR r.route_id LIKE @routeId || '-%'
  ),
  weekday_trips AS (
    SELECT rt.trip_id
    FROM route_trips rt
    JOIN calendar c ON c.service_id = rt.service_id
    WHERE c.monday = 1 OR c.tuesday = 1 OR c.wednesday = 1
       OR c.thursday = 1 OR c.friday = 1
  ),
  weekend_trips AS (
    SELECT rt.trip_id
    FROM route_trips rt
    JOIN calendar c ON c.service_id = rt.service_id
    WHERE c.saturday = 1 OR c.sunday = 1
  ),
  -- Use the first direction-0 trip as the canonical sequence reference.
  canonical_trip AS (
    SELECT rt.trip_id
    FROM route_trips rt
    WHERE rt.direction_id = 0
    LIMIT 1
  ),
  first_stop AS (
    SELECT st.stop_id
    FROM stop_times st
    JOIN canonical_trip ct ON ct.trip_id = st.trip_id
    ORDER BY st.stop_sequence ASC
    LIMIT 1
  ),
  last_stop AS (
    SELECT st.stop_id
    FROM stop_times st
    JOIN canonical_trip ct ON ct.trip_id = st.trip_id
    ORDER BY st.stop_sequence DESC
    LIMIT 1
  )
  SELECT
    -- Terminal stop IDs and names: prefer parent station name for rail platforms.
    s_first.stop_id                                  AS first_stop_id,
    COALESCE(ps_first.stop_name, s_first.stop_name) AS first_stop_name,
    s_last.stop_id                                   AS last_stop_id,
    COALESCE(ps_last.stop_name,  s_last.stop_name)  AS last_stop_name,

    -- Earliest departure across the entire line on weekdays
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekday_trips wt ON wt.trip_id = st.trip_id
      ORDER BY st.departure_timestamp ASC
      LIMIT 1
    ) AS weekday_first,

    -- Latest departure across the entire line on weekdays
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekday_trips wt ON wt.trip_id = st.trip_id
      ORDER BY st.departure_timestamp DESC
      LIMIT 1
    ) AS weekday_last,

    -- Earliest departure across the entire line on weekends
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekend_trips wet ON wet.trip_id = st.trip_id
      ORDER BY st.departure_timestamp ASC
      LIMIT 1
    ) AS weekend_first,

    -- Latest departure across the entire line on weekends
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekend_trips wet ON wet.trip_id = st.trip_id
      ORDER BY st.departure_timestamp DESC
      LIMIT 1
    ) AS weekend_last,

    -- Total number of unique stops served by the route
    (
      SELECT COUNT(DISTINCT st.stop_id)
      FROM stop_times st
      JOIN route_trips rt ON rt.trip_id = st.trip_id
    ) AS stop_count

  FROM first_stop
  JOIN stops s_first      ON s_first.stop_id  = first_stop.stop_id
  LEFT JOIN stops ps_first  ON ps_first.stop_id = s_first.parent_station
  JOIN last_stop
  JOIN stops s_last       ON s_last.stop_id   = last_stop.stop_id
  LEFT JOIN stops ps_last   ON ps_last.stop_id  = s_last.parent_station
`;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

/**
 * Returns a {@link RouteOverview} for the given `routeId`, containing:
 * - The stop name for the first and last stop of the route (direction 0).
 * - The first and last scheduled departure time across the **entire line**
 *   on weekdays (Mon–Fri) and weekends (Sat–Sun).
 *
 * Times are raw GTFS strings in `"HH:MM:SS"` format; values ≥ `"24:00:00"`
 * indicate post-midnight service on the following calendar day.
 * A time value of `null` means the route does not operate on that day type.
 *
 * @throws {Error} if no trips are found for the given `routeId`.
 */
export default async function getRouteOverview(
  routeId: string,
): Promise<RouteOverview> {
  const stmt = getPreparedQuery();
  const row = stmt.get({ routeId }) as OverviewRow | undefined;

  if (!row) {
    throw new Error(`No schedule data found for route: ${routeId}`);
  }

  return {
    firstStopId: row.first_stop_id,
    firstStopName: row.first_stop_name,
    lastStopId: row.last_stop_id,
    lastStopName: row.last_stop_name,
    stopCount: row.stop_count,
    weekday: {
      first: row.weekday_first,
      last: row.weekday_last,
    },
    weekend: {
      first: row.weekend_first,
      last: row.weekend_last,
    },
  };
}
