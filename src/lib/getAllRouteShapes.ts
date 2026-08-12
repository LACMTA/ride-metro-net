import getAllRailBuswayRoutes from "./getAllRailBuswayRoutes";
import getRouteShapes, { type RouteShapeFeature } from "./getRouteShapes";
import type { RouteWithInfo } from "./getRouteById";
import { getLineMapTrips } from "./getLineMapTrips";
import {
  isBuswayRoute,
  buswayRouteSqlCondition,
  resolveRouteShortName,
} from "./routeShortNameOverrides";
import { buildStopPagesRouteCondition } from "./stopEligibility";
import { getGtfsDb } from "./gtfsConfig";
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
  routeId: string;
  routeShortName: string;
  /** GTFS route_type. */
  routeType: number;
  /** GTFS route_color (hex without `#`), may be empty. */
  routeColor: string;
  /** GTFS route_text_color (hex without `#`), may be empty. */
  routeTextColor: string;
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
  /**
   * Regular bus routes (non-busway) serving this station's stop ID. Only
   * populated for busway stations — rail stations never share a stop ID
   * with bus routes, so this is always `[]` for rail. Used to show bus
   * route badges in station popups alongside the rail/busway line badges.
   */
  busRoutes: SystemStationLine[];
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
      ? route.defaultLineColor
      : "#000";
}

/**
 * Builds the {@link SystemMapData} payload for all rail and busway routes
 * that have a `lineMapTrips` config. Each route contributes one line with
 * offset segments for side-by-side rendering of shared corridors. For
 * splitline routes (e.g. J-line 910/950), all core features are rendered
 * so both sides of the split are drawn. For non-splitline routes, a single
 * core direction-0 shape is used (the reverse direction typically traces
 * the same path).
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

    // For splitline routes, render all core features so both sides of
    // the split are drawn. For non-splitline routes, prefer a single
    // core direction-0 feature (the reverse direction typically traces
    // the same path, so rendering both is redundant). Fall back to any
    // core feature, then any feature at all.
    const coreFeatures = shapes.features.filter(
      (f) => f.properties.serviceType === "core",
    );
    const isSplitline = shapes.isSplitline;
    let featuresToRender: RouteShapeFeature[];
    if (isSplitline && coreFeatures.length > 0) {
      featuresToRender = coreFeatures;
    } else {
      const dir0 = coreFeatures.find(
        (f) => (f.properties.directionIds[0] ?? 0) === 0,
      );
      featuresToRender = [dir0 ?? coreFeatures[0] ?? shapes.features[0]];
    }

    routeMeta.set(route.routeId, route);

    // Register stations from all rendered features (deduplicated by
    // parentStationId). For splitline routes, each side has its own set
    // of stops, so we need all features to capture every station.
    // For rail, parent stations are shared across directions, so the
    // deduplication naturally handles this. For busway, each direction
    // and splitline side has distinct stop IDs at different physical
    // locations.
    for (const feature of featuresToRender) {
      for (const stop of feature.properties.stops) {
        const existing = stationById.get(stop.parentStationId);
        if (existing) {
          existing.routes.add(route.routeId);
        } else {
          stationById.set(stop.parentStationId, {
            stopName: stop.stopName,
            lat: stop.lat,
            lon: stop.lon,
            routes: new Set([route.routeId]),
          });
        }
      }
    }

    // For non-splitline busway routes, also register stations from other
    // core features not being rendered (other directions). Unlike rail,
    // busway stops have no parent_station — each direction has distinct
    // stop IDs at different physical locations (often on opposite sides
    // of the busway). Only registering the primary feature's stops would
    // miss half the stops. Rail routes share parent stations across
    // directions, so this is busway-only to avoid creating duplicate
    // markers. (For splitline routes this is already handled above since
    // all core features are rendered.)
    if (!isSplitline && isBuswayRoute(route.routeId)) {
      for (const otherFeature of coreFeatures) {
        if (featuresToRender.includes(otherFeature)) continue;
        for (const stop of otherFeature.properties.stops) {
          const existing = stationById.get(stop.parentStationId);
          if (existing) {
            existing.routes.add(route.routeId);
          } else {
            stationById.set(stop.parentStationId, {
              stopName: stop.stopName,
              lat: stop.lat,
              lon: stop.lon,
              routes: new Set([route.routeId]),
            });
          }
        }
      }
    }

    // Push one SystemShapeInput per rendered feature. For non-splitline
    // routes this is a single feature (the first core direction-0). For
    // splitline routes, this includes all sides so both branches render.
    // Each input gets a unique shapeKey so computeLineOffsets tracks them
    // independently while all segments end up under the same routeId.
    for (const feature of featuresToRender) {
      const shapeKey =
        featuresToRender.length > 1
          ? `${route.routeId}:${feature.properties.splitLineNumber ?? feature.properties.directionIds[0] ?? 0}`
          : undefined;

      inputs.push({
        routeId: route.routeId,
        ...(shapeKey !== undefined && { shapeKey }),
        coordinates: feature.geometry.coordinates,
        stops: feature.properties.stops.map((s) => ({
          parentStationId: s.parentStationId,
          stopName: s.stopName,
          lat: s.lat,
          lon: s.lon,
        })),
      });
    }
  }

  // Compute offset segments for side-by-side rendering of shared corridors.
  const segmentsByRoute = computeLineOffsets(inputs);

  const lines: SystemRouteLine[] = [...routeMeta.keys()].map((routeId) => {
    const route = routeMeta.get(routeId)!;
    return {
      routeId: route.routeId,
      routeShortName: route.routeShortName,
      routeColor: route.routeColor,
      routeType: route.routeType,
      mode: isBuswayRoute(route.routeId) ? "busway" : "rail",
      color: resolveLineColor(route),
      segments: segmentsByRoute.get(routeId) ?? [],
    };
  });

  // Identify busway station IDs — only those need bus-route enrichment.
  const buswayStationIds = [...stationById.keys()].filter((stationId) =>
    [...stationById.get(stationId)!.routes].some((routeId) =>
      isBuswayRoute(routeId),
    ),
  );

  // Query non-busway bus routes serving those busway station stop IDs.
  // Uses the same eligibility and busway-exclusion logic as the bus-stops
  // API endpoint so the system map stays consistent with stop pages.
  const busRoutesByStation = queryBusRoutesForStations(buswayStationIds);

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
          routeId: route.routeId,
          routeShortName: route.routeShortName,
          routeType: route.routeType,
          routeColor: route.routeColor,
          routeTextColor: route.routeTextColor,
          color: resolveLineColor(route),
        };
      }),
      busRoutes: busRoutesByStation.get(stationId) ?? [],
    }),
  );

  return { lines, stations };
}

/**
 * Queries non-busway bus routes (route_type = 3) serving the given stop IDs.
 * Mirrors the logic in `/api/bus-stops` — uses `buildStopPagesRouteCondition`
 * for agency eligibility and `buswayRouteSqlCondition` to exclude busway
 * routes (G / J Line). Returns routes in `SystemStationLine` shape for
 * direct use in station popups.
 *
 * Only called for busway station IDs, so the query set is small (≤ ~60).
 */
function queryBusRoutesForStations(
  stationIds: string[],
): Map<string, SystemStationLine[]> {
  const result = new Map<string, SystemStationLine[]>();
  if (stationIds.length === 0) return result;

  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) return result;

  const db = getGtfsDb();
  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);
  const placeholders = stationIds.map(() => "?").join(",");

  const rows = db
    .prepare(
      `
      SELECT DISTINCT
        st.stop_id AS stop_id,
        r.route_id AS route_id,
        r.route_short_name AS route_short_name,
        r.route_type AS route_type,
        COALESCE(r.route_color, '') AS route_color,
        COALESCE(r.route_text_color, '') AS route_text_color
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE st.stop_id IN (${placeholders})
        AND ${routeCond.clause}
        AND r.route_type = 3
        AND ${buswayExclude}
      GROUP BY st.stop_id, r.route_id
      `,
    )
    .all(...stationIds, ...routeCond.params) as BusRouteRow[];

  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const shortName = resolveRouteShortName(row.route_id, row.route_short_name);
    const prefix = row.route_id.split("-")[0];
    let dedupSet = seen.get(row.stop_id);
    if (!dedupSet) {
      dedupSet = new Set();
      seen.set(row.stop_id, dedupSet);
    }
    if (dedupSet.has(shortName)) continue;
    dedupSet.add(shortName);

    let list = result.get(row.stop_id);
    if (!list) {
      list = [];
      result.set(row.stop_id, list);
    }
    list.push({
      routeId: prefix,
      routeShortName: shortName,
      routeType: row.route_type,
      routeColor: row.route_color,
      routeTextColor: row.route_text_color,
      color: row.route_color ? `#${row.route_color}` : "#e16710",
    });
  }

  return result;
}

interface BusRouteRow {
  stop_id: string;
  route_id: string;
  route_short_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}
