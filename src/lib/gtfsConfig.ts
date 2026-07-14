import { openDb, type Config } from "gtfs";
import type Database from "better-sqlite3";
import { agencyConfigs } from "./agencies";

/**
 * Path to the SQLite database file used by node-gtfs for both static
 * schedule data and realtime (alerts/trip-updates/vehicle-positions) rows.
 */
export const DB_PATH = "./data/data.db";

export const gtfsConfig: Config = {
  sqlitePath: DB_PATH,
  agencies: agencyConfigs.map((a) => a.gtfs),
  verbose: true,
  ignoreDuplicates: true,
  // node-gtfs defaults this to 0, which makes every realtime row's
  // expiration_timestamp equal to its created_timestamp — i.e. born expired.
  // Give realtime rows a real TTL so `expiration_timestamp > now` filters work.
  // We poll every minute, so 10 minutes is a comfortable buffer.
  gtfsRealtimeExpirationSeconds: 600,
};

/**
 * Cached, shared `better-sqlite3` connection for the GTFS database.
 *
 * `better-sqlite3` is synchronous and single-threaded per process, so a
 * single connection is safe to reuse across SSR requests and the realtime
 * cron poller. The connection is opened lazily on first use and applies a
 * set of read-oriented pragmas tuned for this app's query patterns.
 *
 * @returns A shared {@link Database} instance for the GTFS SQLite database.
 */
let dbInstance: Database.Database | null = null;

export function getGtfsDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = openDb(gtfsConfig);
    dbInstance.pragma("synchronous = NORMAL");
    dbInstance.pragma("cache_size = 10000");
    dbInstance.pragma("temp_store = MEMORY");
    dbInstance.pragma("journal_mode = WAL");

    // ---------------------------------------------------------------------------
    // Application-level indexes
    //
    // node-gtfs only creates its own schema indexes; any additional indexes
    // needed for this app's query patterns are created here on first open.
    // `IF NOT EXISTS` makes these idempotent across restarts and DB rebuilds.
    // ---------------------------------------------------------------------------

    dbInstance.exec(`
      -- Allow the EXISTS subquery in getServiceAlertsFromDb to seek by route_id
      -- and stop_id rather than scanning the full entity table.
      CREATE INDEX IF NOT EXISTS idx_saie_route_id
        ON service_alert_informed_entities (route_id);

      CREATE INDEX IF NOT EXISTS idx_saie_stop_id
        ON service_alert_informed_entities (stop_id);

      -- Let the predictions endpoint filter by stop_id AND expiration in a
      -- single index seek instead of a stop_id lookup + per-row expiration scan.
      CREATE INDEX IF NOT EXISTS idx_stop_time_updates_stop_id_expiration
        ON stop_time_updates (stop_id, expiration_timestamp);

      -- Allow getStopWithRoutes (and the child-stops query) to seek by stop_id
      -- instead of scanning the full ~3.5M-row stop_times table.
      CREATE INDEX IF NOT EXISTS idx_stop_times_stop_id
        ON stop_times (stop_id);
    `);
  }
  return dbInstance;
}
