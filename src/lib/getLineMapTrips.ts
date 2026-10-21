import lineMapTripsData from "../data/lineMapTrips.json";
import type {
  LineMapTrips,
  LineMapRouteConfig,
  LineMapTripConfig,
} from "../data/types";

const lineMapTrips = lineMapTripsData as LineMapTrips;

/**
 * Returns the full line-map trips config as a typed `LineMapTrips` object.
 */
export function getAllLineMapTrips(): LineMapTrips {
  return lineMapTrips;
}

/**
 * Returns the config for a single route's map trips, or `undefined` if no
 * config exists for the given route ID prefix.
 */
export function getLineMapTrips(
  routeId: string,
): LineMapRouteConfig | undefined {
  return lineMapTrips[routeId];
}

/**
 * Returns an array of `{ routeId, config }` entries for use in iteration.
 */
export function getLineMapTripEntries(): Array<{
  routeId: string;
  config: LineMapRouteConfig;
}> {
  return Object.entries(lineMapTrips).map(([routeId, config]) => ({
    routeId,
    config,
  }));
}

/**
 * Returns the individual trip configs for a route, or `undefined` if the
 * route is not configured.
 */
export function getLineMapTripList(
  routeId: string,
): LineMapTripConfig[] | undefined {
  return lineMapTrips[routeId]?.trips;
}