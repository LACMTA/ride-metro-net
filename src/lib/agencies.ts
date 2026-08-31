import type { Config } from "gtfs";

/**
 * App-level configuration for a single transit agency. Wraps the node-gtfs
 * agency config with additional metadata that controls which pages and
 * features are enabled for this agency.
 */
export interface AgencyConfig {
  /** Passed directly to node-gtfs as an entry in `Config["agencies"]`. */
  gtfs: Config["agencies"][number];
  agencySettings: {
    /**
     * The agency_id for the feed, including an `prefix` set in `gtfs` config.
     * We need to define this here so we can reconcile these settings to the right
     * agency in the database.
     * TODO: this is potentially brittle if agencies change the agency_id in their feed.
     */
    agencyId: string;
    /**
     * When `true`, this agency is included in `/alerts`
     * @default false
     */
    showInAlertsIndex?: boolean;
    /**
     * When `true`, line pages (`/lines/[routeId]/*`) are built for this agency
     * @default false
     */
    buildLinePages?: boolean;
    /**
     * When `true`, stop pages (`/stops/[stopId]/*`) are built for this agency
     * @default false
     */
    buildStopPages?: boolean;
    /** Brand color (hex) for the agency, used on screen displays. */
    color?: string;
    /**
     * Default line color (hex without leading `#`) for routes whose GTFS
     * `route_color` is empty. When GTFS provides a `route_color`, it takes
     * precedence over this value.
     */
    lineColor?: string;
    /** Filename of the agency logo stored under `/public/agency-logos/`. */
    logoFile?: string;
  }[];
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

/**
 * Return the list of agency IDs (`agencySettings.agencyId`) that have the
 * given flag set to `true`.
 *
 * Used to restrict queries to the agencies that should appear on a particular
 * page or feature (e.g. `showInAlertsIndex` for `/alerts`,
 * `buildLinePages` for line pages, `buildStopPages` for stop pages).
 */
export function getAgencyIdsByFlag(
  flag: "showInAlertsIndex" | "buildLinePages" | "buildStopPages",
): string[] {
  return agencyConfigs.flatMap((cfg) =>
    cfg.agencySettings.filter((s) => s[flag]).map((s) => s.agencyId),
  );
}

/**
 * Return the `agencySettings` entry for the given `agencyId`, or `undefined`
 * if no agency in `agencyConfigs` matches.
 */
export function getAgencySettings(agencyId: string) {
  for (const cfg of agencyConfigs) {
    const s = cfg.agencySettings.find((s) => s.agencyId === agencyId);
    if (s) return s;
  }
  return undefined;
}

export const agencyConfigs: AgencyConfig[] = [
  // LA Metro Rail
  {
    agencySettings: [
      {
        agencyId: "LACMTA_Rail",
        showInAlertsIndex: true,
        buildLinePages: true,
        buildStopPages: true,
        color: "#121212",
        lineColor: "e16710",
        logoFile: "metro.svg",
      },
    ],
    gtfs: {
      fillEmptyAgencyId: true,
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
    agencySettings: [
      {
        agencyId: "LACMTA",
        showInAlertsIndex: true,
        buildLinePages: true,
        buildStopPages: true,
        color: "#121212",
        lineColor: "e16710",
        logoFile: "metro.svg",
      },
    ],
    gtfs: {
      fillEmptyAgencyId: true,
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
