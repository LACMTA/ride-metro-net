import type { Config } from "gtfs";

/**
 * App-level configuration for a single transit agency. Wraps the node-gtfs
 * agency config with additional metadata that controls which pages and
 * features are enabled for this agency.
 */
export interface AgencyConfig {
  /** Passed directly to node-gtfs as an entry in `Config["agencies"]`. */
  gtfs: Config["agencies"][number];

  // add additional agency metadata here
}

// Ensure .env is available when running outside of Astro (e.g. scripts).
// This must run here because this module is evaluated before gtfsConfig.ts.
try {
  process.loadEnvFile();
} catch {
  // No `.env` file present — fall back to whatever is already in the
  // environment (e.g. variables injected by the hosting platform).
}

const API_KEY = import.meta.env?.API_KEY || process.env.API_KEY;
if (!API_KEY) throw new Error("Swiftly API_KEY not defined!");

export const agencyConfigs: AgencyConfig[] = [
  // LA Metro Rail
  {
    gtfs: {
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
  },
  // LA Metro Bus
  {
    gtfs: {
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
  },
];
