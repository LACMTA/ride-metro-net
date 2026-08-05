import getAllRailBuswayRoutes from "./getAllRailBuswayRoutes";
import getRouteShapes, { type RouteShapeFeature } from "./getRouteShapes";
import type { RouteWithInfo } from "./getRouteById";
import { getLineMapTrips } from "./getLineMapTrips";
import { isBuswayRoute } from "./routeShortNameOverrides";
import {
  processSystemShapes,
  type RenderSegment,
  type SystemShapeInput,
} from "./processSystemShapes";

/**
 * One route's render-ready line for the system-wide map. The geometry has
 * been processed at build time (see {@link processSystemShapes}): snapped
 * through stops, simplified, smoothed, and split into offset segments so
 * co-running lines can be drawn side by side.
 */
export interface SystemRouteLine {
  routeId: string;
  routeShortName: string;
  /** GTFS route_color (hex without `#`), may be empty for bus. */
  routeColor: string;
  /** GTFS route_type. */
  routeType: number;
  /** `"rail"` or `"busway"` — used for styling decisions. */
  mode: "rail" | "busway";
  /** Resolved CSS color string with leading `#`. */
  color: string;
  /**
   * Drawable segments in travel order. Each carries an integer offset slot;
   * the client multiplies it by a pixel spacing so co-running lines render
   * next to each other at every zoom level.
   */
  segments: RenderSegment[];
}

/**
 * A unique station on the system map. Stations shared by multiple lines have
 * `lineCount > 1` and are rendered with a larger interchange marker.
 */
export interface SystemStation {
  stationId: string;
  stopName: string;
  lat: number;
  lon: number;
  /** Number of system-map lines serving this station. */
  lineCount: number;
}

/**
 * Complete prerendered payload for the system-wide map: one processed line
 * per route plus a deduplicated list of stations.
 */
export interface SystemMapData {
  lines: SystemRouteLine[];
  stations: SystemStation[];
}

/**
 * Resolves the line color for a route, matching the logic in the line page:
 * GTFS route_color takes precedence, then the agency-level default line color,
 * then a black fallback. Returns a CSS hex string with leading `#`.
 */
function resolveLineColor(route: RouteWithInfo): string {
  return route.routeColor
    ? `#${route.routeColor}`
    : route.defaultLineColor
      ? `#${route.defaultLineColor}`
      : "#000";
}

/**
 * Builds the {@link SystemMapData} payload for all rail and busway routes
 * that have a `lineMapTrips` config. Each route contributes one line: the
 * first "core" service shape (direction 0) from its configured trips, run
 * through the build-time geometry processor.
 *
 * Routes without a `lineMapTrips` config are silently skipped — `getRouteShapes`
 * returns `null` for those.
 */
export default async function getAllRouteShapes(): Promise<SystemMapData> {
  const routes = await getAllRailBuswayRoutes();

  const inputs: SystemShapeInput[] = [];
  const routeMeta = new Map<string, RouteWithInfo>();

  for (const route of routes) {
    // Skip routes without a line-map config — no shape data available.
    if (!getLineMapTrips(route.routeId)) continue;

    const shapes = getRouteShapes(route.routeId);
    if (!shapes || shapes.features.length === 0) continue;

    // Prefer the first "core" direction-0 feature; fall back to any core
    // feature, then any feature at all.
    const coreFeatures = shapes.features.filter(
      (f) => f.properties.serviceType === "core",
    );
    const dir0 = coreFeatures.find(
      (f) => (f.properties.directionIds[0] ?? 0) === 0,
    );
    const feature: RouteShapeFeature =
      dir0 ?? coreFeatures[0] ?? shapes.features[0];

    routeMeta.set(route.routeId, route);
    inputs.push({
      routeId: route.routeId,
      coordinates: feature.geometry.coordinates,
      stops: feature.properties.stops.map((s) => ({
        parentStationId: s.parentStationId,
        stopName: s.stopName,
        lat: s.lat,
        lon: s.lon,
      })),
    });
  }

  // Build-time geometry processing: snap lines through stops, simplify,
  // smooth, and compute side-by-side offsets for shared corridors.
  const { segmentsByRoute, stations } = processSystemShapes(inputs);

  const lines: SystemRouteLine[] = inputs.map((input) => {
    const route = routeMeta.get(input.routeId)!;
    return {
      routeId: route.routeId,
      routeShortName: route.routeShortName,
      routeColor: route.routeColor,
      routeType: route.routeType,
      mode: isBuswayRoute(route.routeId) ? "busway" : "rail",
      color: resolveLineColor(route),
      segments: segmentsByRoute.get(input.routeId) ?? [],
    };
  });

  return { lines, stations };
}
