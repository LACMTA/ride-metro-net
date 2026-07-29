import getAllRailBuswayRoutes from "./getAllRailBuswayRoutes";
import getRouteShapes, { type RouteShapeFeature } from "./getRouteShapes";
import type { RouteWithInfo } from "./getRouteById";
import { getLineMapTrips } from "./getLineMapTrips";
import { isBuswayRoute } from "./routeShortNameOverrides";

/**
 * GeoJSON feature for the system-wide map. Each feature is a single route's
 * polyline (the first core direction), tagged with route metadata for styling
 * and linking.
 */
export interface SystemRouteFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: {
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
  };
}

/**
 * GeoJSON FeatureCollection of all rail and busway route polylines for the
 * system-wide map. Each feature represents one route's primary direction shape.
 */
export interface SystemRouteShapes {
  type: "FeatureCollection";
  features: SystemRouteFeature[];
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
 * Builds a {@link SystemRouteShapes} collection for all rail and busway routes
 * that have a `lineMapTrips` config. Each route contributes one feature: the
 * first "core" service shape (direction 0) from its configured trips.
 *
 * Routes without a `lineMapTrips` config are silently skipped — `getRouteShapes`
 * returns `null` for those.
 */
export default async function getAllRouteShapes(): Promise<SystemRouteShapes> {
  const routes = await getAllRailBuswayRoutes();

  const features: SystemRouteFeature[] = [];

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

    features.push({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        routeId: route.routeId,
        routeShortName: route.routeShortName,
        routeColor: route.routeColor,
        routeType: route.routeType,
        mode: isBuswayRoute(route.routeId) ? "busway" : "rail",
        color: resolveLineColor(route),
      },
    });
  }

  return { type: "FeatureCollection", features };
}
