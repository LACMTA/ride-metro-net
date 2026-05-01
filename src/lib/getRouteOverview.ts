import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import type Database from "better-sqlite3";

/** A pair of GTFS time strings (e.g. "05:30:00", "24:45:00") representing
 *  the first and last scheduled service at a stop. Either value may be null
 *  if the route does not operate on that day type. */
export interface ServiceTimes {
  /** Earliest departure/arrival, e.g. "04:52:00" */
  first: string | null;
  /** Latest departure/arrival — may exceed 24 h for post-midnight trips, e.g. "25:42:00" */
  last: string | null;
}

/** One terminal endpoint of the route with its service window. */
export interface RouteEndpoint {
  stopName: string;
  weekday: ServiceTimes;
  weekend: ServiceTimes;
}

/**
 * High-level schedule overview for a route:
 * - the stop names for the two terminal stops (first and last of direction 0)
 * - the first and last service time at each terminal on weekdays and weekends
 */
export interface RouteOverview {
  firstStop: RouteEndpoint;
  lastStop: RouteEndpoint;
}

interface OverviewRow {
  first_stop_name: string;
  first_stop_weekday_first: string | null;
  first_stop_weekday_last: string | null;
  first_stop_weekend_first: string | null;
  first_stop_weekend_last: string | null;
  last_stop_name: string;
  last_stop_weekday_first: string | null;
  last_stop_weekday_last: string | null;
  last_stop_weekend_first: string | null;
  last_stop_weekend_last: string | null;
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
 *  3. Picks a canonical direction-0 trip to determine the first and last terminal stops.
 *  4. Returns the earliest and latest departure_time at the first terminal and
 *     earliest and latest arrival_time at the last terminal, for each day type.
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
  first_stop_id AS (
    SELECT st.stop_id
    FROM stop_times st
    JOIN canonical_trip ct ON ct.trip_id = st.trip_id
    ORDER BY st.stop_sequence ASC
    LIMIT 1
  ),
  last_stop_id AS (
    SELECT st.stop_id
    FROM stop_times st
    JOIN canonical_trip ct ON ct.trip_id = st.trip_id
    ORDER BY st.stop_sequence DESC
    LIMIT 1
  )
  SELECT
    -- Stop names: prefer parent station name for rail platforms.
    COALESCE(ps_first.stop_name, s_first.stop_name) AS first_stop_name,
    COALESCE(ps_last.stop_name,  s_last.stop_name)  AS last_stop_name,

    -- First stop departure times (weekday)
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekday_trips wt ON wt.trip_id = st.trip_id
      JOIN first_stop_id fs ON fs.stop_id = st.stop_id
      ORDER BY st.departure_timestamp ASC
      LIMIT 1
    ) AS first_stop_weekday_first,
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekday_trips wt ON wt.trip_id = st.trip_id
      JOIN first_stop_id fs ON fs.stop_id = st.stop_id
      ORDER BY st.departure_timestamp DESC
      LIMIT 1
    ) AS first_stop_weekday_last,

    -- First stop departure times (weekend)
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekend_trips wet ON wet.trip_id = st.trip_id
      JOIN first_stop_id fs ON fs.stop_id = st.stop_id
      ORDER BY st.departure_timestamp ASC
      LIMIT 1
    ) AS first_stop_weekend_first,
    (
      SELECT st.departure_time
      FROM stop_times st
      JOIN weekend_trips wet ON wet.trip_id = st.trip_id
      JOIN first_stop_id fs ON fs.stop_id = st.stop_id
      ORDER BY st.departure_timestamp DESC
      LIMIT 1
    ) AS first_stop_weekend_last,

    -- Last stop arrival times (weekday)
    (
      SELECT st.arrival_time
      FROM stop_times st
      JOIN weekday_trips wt ON wt.trip_id = st.trip_id
      JOIN last_stop_id ls ON ls.stop_id = st.stop_id
      ORDER BY st.arrival_timestamp ASC
      LIMIT 1
    ) AS last_stop_weekday_first,
    (
      SELECT st.arrival_time
      FROM stop_times st
      JOIN weekday_trips wt ON wt.trip_id = st.trip_id
      JOIN last_stop_id ls ON ls.stop_id = st.stop_id
      ORDER BY st.arrival_timestamp DESC
      LIMIT 1
    ) AS last_stop_weekday_last,

    -- Last stop arrival times (weekend)
    (
      SELECT st.arrival_time
      FROM stop_times st
      JOIN weekend_trips wet ON wet.trip_id = st.trip_id
      JOIN last_stop_id ls ON ls.stop_id = st.stop_id
      ORDER BY st.arrival_timestamp ASC
      LIMIT 1
    ) AS last_stop_weekend_first,
    (
      SELECT st.arrival_time
      FROM stop_times st
      JOIN weekend_trips wet ON wet.trip_id = st.trip_id
      JOIN last_stop_id ls ON ls.stop_id = st.stop_id
      ORDER BY st.arrival_timestamp DESC
      LIMIT 1
    ) AS last_stop_weekend_last

  FROM first_stop_id
  JOIN stops s_first     ON s_first.stop_id = first_stop_id.stop_id
  LEFT JOIN stops ps_first ON ps_first.stop_id = s_first.parent_station
  JOIN last_stop_id
  JOIN stops s_last      ON s_last.stop_id = last_stop_id.stop_id
  LEFT JOIN stops ps_last  ON ps_last.stop_id = s_last.parent_station
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
 * - The first and last scheduled departure/arrival time at each terminal
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
    firstStop: {
      stopName: row.first_stop_name,
      weekday: {
        first: row.first_stop_weekday_first,
        last: row.first_stop_weekday_last,
      },
      weekend: {
        first: row.first_stop_weekend_first,
        last: row.first_stop_weekend_last,
      },
    },
    lastStop: {
      stopName: row.last_stop_name,
      weekday: {
        first: row.last_stop_weekday_first,
        last: row.last_stop_weekday_last,
      },
      weekend: {
        first: row.last_stop_weekend_first,
        last: row.last_stop_weekend_last,
      },
    },
  };
}
