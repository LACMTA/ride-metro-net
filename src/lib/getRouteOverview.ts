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
 * Optimised single-pass query that:
 *
 *  1. Collects all trips for the route (matching exact route_id or "routeId-%" prefix)
 *     directly from the `trips` table — the unnecessary JOIN to `routes` is removed
 *     because `trips.route_id` is already indexed.
 *
 *  2. Pre-computes a `trip_day_types` CTE that tags each trip as weekday and/or
 *     weekend with a single GROUP BY over the small calendar table, avoiding
 *     redundant calendar lookups.
 *
 *  3. Computes **all four** min/max departure timestamps **plus** the distinct stop
 *     count in a single aggregation pass over `stop_times` joined to the small
 *     `trip_day_types` CTE — rather than five separate correlated sub-queries
 *     that each scanned the 2 M-row `stop_times` table independently.
 *
 *  4. Reconstructs HH:MM:SS time strings from the integer timestamps via
 *     `printf()`, avoiding extra lookups back into `stop_times`.
 *
 *  5. Picks a canonical direction-0 trip to determine the first and last terminal
 *     stop names.
 *
 * Times are returned as GTFS strings ("HH:MM:SS") and may exceed 24 h for
 * post-midnight service (e.g. "25:42:00").
 */
const query = `
  WITH route_trips AS (
    SELECT t.trip_id, t.service_id, t.direction_id
    FROM trips t
    WHERE t.route_id = @routeId
       OR t.route_id LIKE @routeId || '-%'
  ),

  -- Tag each trip as weekday / weekend in one pass over the small calendar table.
  trip_day_types AS (
    SELECT
      rt.trip_id,
      rt.direction_id,
      MAX(c.monday = 1 OR c.tuesday = 1 OR c.wednesday = 1
          OR c.thursday = 1 OR c.friday = 1) AS is_weekday,
      MAX(c.saturday = 1 OR c.sunday = 1) AS is_weekend
    FROM route_trips rt
    JOIN calendar c ON c.service_id = rt.service_id
    GROUP BY rt.trip_id, rt.direction_id
  ),

  -- Single-pass aggregation: MIN/MAX timestamps + stop count in one scan
  -- of only this route's stop_times rows (via PK index on trip_id).
  agg AS (
    SELECT
      MIN(CASE WHEN tdt.is_weekday THEN st.departure_timestamp END) AS wd_first_ts,
      MAX(CASE WHEN tdt.is_weekday THEN st.departure_timestamp END) AS wd_last_ts,
      MIN(CASE WHEN tdt.is_weekend THEN st.departure_timestamp END) AS we_first_ts,
      MAX(CASE WHEN tdt.is_weekend THEN st.departure_timestamp END) AS we_last_ts,
      COUNT(DISTINCT st.stop_id) AS stop_count
    FROM stop_times st
    JOIN trip_day_types tdt ON tdt.trip_id = st.trip_id
  ),

  -- Use the first direction-0 trip as the canonical sequence reference.
  canonical_trip AS (
    SELECT tdt.trip_id
    FROM trip_day_types tdt
    WHERE tdt.direction_id = 0
    LIMIT 1
  ),
  first_stop AS (
    SELECT st.stop_id
    FROM stop_times st
    WHERE st.trip_id = (SELECT trip_id FROM canonical_trip)
    ORDER BY st.stop_sequence ASC
    LIMIT 1
  ),
  last_stop AS (
    SELECT st.stop_id
    FROM stop_times st
    WHERE st.trip_id = (SELECT trip_id FROM canonical_trip)
    ORDER BY st.stop_sequence DESC
    LIMIT 1
  )

  SELECT
    -- Terminal stop IDs and names: prefer parent station name for rail platforms.
    s_first.stop_id                                  AS first_stop_id,
    COALESCE(ps_first.stop_name, s_first.stop_name)  AS first_stop_name,
    s_last.stop_id                                   AS last_stop_id,
    COALESCE(ps_last.stop_name,  s_last.stop_name)   AS last_stop_name,

    agg.stop_count,

    -- Reconstruct HH:MM:SS strings from the integer timestamps.
    CASE WHEN agg.wd_first_ts IS NOT NULL THEN
      printf('%02d:%02d:%02d', agg.wd_first_ts / 3600, (agg.wd_first_ts % 3600) / 60, agg.wd_first_ts % 60)
    END AS weekday_first,
    CASE WHEN agg.wd_last_ts IS NOT NULL THEN
      printf('%02d:%02d:%02d', agg.wd_last_ts / 3600, (agg.wd_last_ts % 3600) / 60, agg.wd_last_ts % 60)
    END AS weekday_last,
    CASE WHEN agg.we_first_ts IS NOT NULL THEN
      printf('%02d:%02d:%02d', agg.we_first_ts / 3600, (agg.we_first_ts % 3600) / 60, agg.we_first_ts % 60)
    END AS weekend_first,
    CASE WHEN agg.we_last_ts IS NOT NULL THEN
      printf('%02d:%02d:%02d', agg.we_last_ts / 3600, (agg.we_last_ts % 3600) / 60, agg.we_last_ts % 60)
    END AS weekend_last

  FROM agg
  JOIN first_stop
  JOIN stops s_first       ON s_first.stop_id  = first_stop.stop_id
  LEFT JOIN stops ps_first ON ps_first.stop_id = s_first.parent_station
  JOIN last_stop
  JOIN stops s_last        ON s_last.stop_id   = last_stop.stop_id
  LEFT JOIN stops ps_last  ON ps_last.stop_id  = s_last.parent_station
`;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

/** In-memory cache — GTFS data is static for the lifetime of the process. */
const cache = new Map<string, RouteOverview>();

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
 * Results are cached in-memory — GTFS schedule data does not change at runtime.
 *
 * @throws {Error} if no trips are found for the given `routeId`.
 */
export default async function getRouteOverview(
  routeId: string,
): Promise<RouteOverview> {
  const cached = cache.get(routeId);
  if (cached) return cached;

  const stmt = getPreparedQuery();
  const row = stmt.get({ routeId }) as OverviewRow | undefined;

  if (!row) {
    throw new Error(`No schedule data found for route: ${routeId}`);
  }

  const result: RouteOverview = {
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

  cache.set(routeId, result);
  return result;
}
