import { openDb, type Config } from "gtfs";
import type Database from "better-sqlite3";

/**
 * Path to the SQLite database file used by node-gtfs for both static
 * schedule data and realtime (alerts/trip-updates/vehicle-positions) rows.
 */
export const DB_PATH = "./data/data.db";

// Ensure .env is available when running outside of Astro (e.g. scripts).
try {
  process.loadEnvFile();
} catch {
  // No `.env` file present — fall back to whatever is already in the
  // environment (e.g. variables injected by the hosting platform).
}

const API_KEY = import.meta.env?.API_KEY || process.env.API_KEY;
if (!API_KEY) throw new Error("Swiftly API_KEY not defined!");

const agencies: Config["agencies"] = [
  {
    // train
    url: "https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip?ref_type=heads&inline=false",
    realtimeAlerts: {
      url: "https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-alerts/v2",
      headers: {
        Authorization: API_KEY,
      },
    },
    realtimeTripUpdates: {
      url: "https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-trip-updates",
      headers: {
        Authorization: API_KEY,
      },
    },
    realtimeVehiclePositions: {
      url: "https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-vehicle-positions",
      headers: {
        Authorization: API_KEY,
      },
    },
  },
  {
    // bus
    url: "https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip?ref_type=heads&inline=false",
    realtimeAlerts: {
      url: "https://api.goswift.ly/real-time/lametro/gtfs-rt-alerts/v2",
      headers: {
        Authorization: API_KEY,
      },
    },
    realtimeTripUpdates: {
      url: "https://api.goswift.ly/real-time/lametro/gtfs-rt-trip-updates",
      headers: {
        Authorization: API_KEY,
      },
    },
    realtimeVehiclePositions: {
      url: "https://api.goswift.ly/real-time/lametro/gtfs-rt-vehicle-positions",
      headers: {
        Authorization: API_KEY,
      },
    },
  },
];

export const gtfsConfig: Config = {
  sqlitePath: DB_PATH,
  agencies,
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
  }
  return dbInstance;
}
