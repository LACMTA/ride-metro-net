import getAllRailBuswayRoutes from "./getAllRailBuswayRoutes";
import getRouteShapes, { type RouteShapeFeature } from "./getRouteShapes";
import type { RouteWithInfo } from "./getRouteById";
import { getLineMapTrips } from "./getLineMapTrips";
import { isBuswayRoute } from "./routeShortNameOverrides";
import {
  computeLineOffsets,
  type RenderSegment,
  type SystemShapeInput,
} from "./computeLineOffsets";

/**
 * One route's render-ready line for the system-wide map. The geometry has
 * been split into offset segments by {@link computeLineOffsets} so
 * co-running lines can be drawn side by side. Visual simplification and
 * corner rounding are handled at render time by MapLibre.
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
 * A line serving a station, for rendering colored route badges in popups.
 */
export interface SystemStationLine {
  routeShortName: string;
  /** Resolved CSS color string with leading `#`. */
  color: string;
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
  /** Lines serving this station, for popup badges. */
  lines: SystemStationLine[];
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
 * first "core" direction-0 shape from its configured trips, split into
 * offset segments for side-by-side rendering of shared corridors.
 *
 * Routes without a `lineMapTrips` config are silently skipped — `getRouteShapes`
 * returns `null` for those.
 */
export default async function getAllRouteShapes(): Promise<SystemMapData> {
  const routes = await getAllRailBuswayRoutes();

  const inputs: SystemShapeInput[] = [];
  const routeMeta = new Map<string, RouteWithInfo>();
  const stationById = new Map<
    string,
    { stopName: string; lat: number; lon: number; routes: Set<string> }
  >();

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

    // Register stations (deduplicated by parentStationId).
    for (const stop of feature.properties.stops) {
      let station = stationById.get(stop.parentStationId);
      if (!station) {
        station = {
          stopName: stop.stopName,
          lat: stop.lat,
          lon: stop.lon,
          routes: new Set(),
        };
        stationById.set(stop.parentStationId, station);
      }
      station.routes.add(route.routeId);
    }

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

  // Compute offset segments for side-by-side rendering of shared corridors.
  const segmentsByRoute = computeLineOffsets(inputs);

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

  const stations: SystemStation[] = [...stationById.entries()].map(
    ([stationId, s]) => ({
      stationId,
      stopName: s.stopName,
      lat: s.lat,
      lon: s.lon,
      lineCount: s.routes.size,
      lines: [...s.routes].map((routeId) => {
        const route = routeMeta.get(routeId)!;
        return {
          routeShortName: route.routeShortName,
          color: resolveLineColor(route),
        };
      }),
    }),
  );

  return { lines, stations };
}
