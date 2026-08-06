export const prerender = false;

import { getGtfsDb } from "../../lib/gtfsConfig";
import {
  buswayRouteSqlCondition,
  resolveRouteShortName,
} from "../../lib/routeShortNameOverrides";
import { prodCacheHeader } from "../../lib/prodCacheHeader";
import { buildStopPagesRouteCondition } from "../../lib/stopEligibility";

export interface BusRouteInfo {
  routeId: string;
  routeShortName: string;
  /** GTFS route_type (always 3 for bus, but included for badge logic). */
  routeType: number;
  /** GTFS route_color (hex without `#`), may be empty. */
  routeColor: string;
  /** GTFS route_text_color (hex without `#`), may be empty. */
  routeTextColor: string;
}

export interface BusStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  /** Distinct bus routes serving this stop (excluding busway routes). */
  routes: BusRouteInfo[];
}

interface BusStopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

interface RouteRow {
  stop_id: string;
  route_id: string;
  route_short_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

/**
 * GET /api/bus-stops?bbox=west,south,east,north
 *
 * Returns bus stops (location_type 0 or NULL, no parent_station) within the
 * given bounding box, each with the distinct bus routes serving it. The
 * bounding box should be snapped to a fixed grid on the client so that
 * repeated requests for the same area produce identical URLs and benefit
 * from HTTP caching.
 *
 * @param {string} bbox - Comma-separated `west,south,east,north` in lng/lat.
 * @returns {{ stops: BusStop[] }}
 */
export async function GET(context: import("astro").APIContext) {
  const bboxParam = context.url.searchParams.get("bbox");
  if (!bboxParam) {
    return new Response("bbox query parameter is required", { status: 400 });
  }

  const parts = bboxParam.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return new Response(
      "bbox must be four comma-separated numbers: west,south,east,north",
      { status: 400 },
    );
  }

  const [west, south, east, north] = parts;
  if (west > east || south > north) {
    return new Response("bbox must satisfy west <= east and south <= north", {
      status: 400,
    });
  }

  const db = getGtfsDb();

  // Shared condition: routes from buildStopPages agencies with non-empty
  // route_long_name. Keeps the system map 1-1 with built stop pages.
  const routeCond = buildStopPagesRouteCondition("r");
  if (routeCond.params.length === 0) {
    return new Response(JSON.stringify({ stops: [] }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": prodCacheHeader(),
      },
    });
  }

  // Exclude busway routes (G / J Line) from the bus-stop route list — those
  // are shown as rail-style stations on the system map.
  const buswayExclude = buswayRouteSqlCondition("r.route_id", false);

  // --- Query 1: qualifying stops in the bounding box ---
  // A stop is included if it has at least one eligible (buildStopPages agency,
  // non-empty route_long_name, non-busway) route serving it. We do NOT exclude
  // stops that also happen to be served by busway routes — we just filter the
  // busway routes out of the route list in Query 2.
  const stopRows = db
    .prepare(
      `
      SELECT stop_id, stop_name, stop_lat, stop_lon
      FROM stops
      WHERE stop_lat BETWEEN ? AND ?
        AND stop_lon BETWEEN ? AND ?
        AND (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
        AND EXISTS (
          SELECT 1 FROM stop_times st
          JOIN trips t ON t.trip_id = st.trip_id
          JOIN routes r ON r.route_id = t.route_id
          WHERE st.stop_id = stops.stop_id
            AND ${routeCond.clause}
            AND ${buswayExclude}
        )
      `,
    )
    .all(south, north, west, east, ...routeCond.params) as BusStopRow[];

  if (stopRows.length === 0) {
    return new Response(JSON.stringify({ stops: [] }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": prodCacheHeader(),
      },
    });
  }

  // --- Query 2: distinct bus routes serving those stops ---
  // Uses idx_stop_times_stop_id for an indexed seek per stop_id. Excludes
  // busway routes since those are rendered as rail-style stations.
  const stopIds = stopRows.map((r) => r.stop_id);
  const placeholders = stopIds.map(() => "?").join(",");

  const routeRows = db
    .prepare(
      `
      SELECT st.stop_id, r.route_id, r.route_short_name, r.route_type, r.route_color, r.route_text_color
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE st.stop_id IN (${placeholders})
        AND ${routeCond.clause}
        AND ${buswayExclude}
      GROUP BY st.stop_id, r.route_id
      `,
    )
    .all(...stopIds, ...routeCond.params) as RouteRow[];

  // --- Merge: group routes by stop_id, dedup by route_short_name ---
  const routesByStop = new Map<string, BusRouteInfo[]>();
  const seenShortNames = new Map<string, Set<string>>();

  for (const row of routeRows) {
    let routes = routesByStop.get(row.stop_id);
    if (!routes) {
      routes = [];
      routesByStop.set(row.stop_id, routes);
      seenShortNames.set(row.stop_id, new Set());
    }
    const shortName = resolveRouteShortName(row.route_id, row.route_short_name);
    const seen = seenShortNames.get(row.stop_id)!;
    if (seen.has(shortName)) continue;
    seen.add(shortName);

    routes.push({
      routeId: row.route_id,
      routeShortName: shortName,
      routeType: row.route_type,
      routeColor: row.route_color ?? "",
      routeTextColor: row.route_text_color ?? "",
    });
  }

  const stops: BusStop[] = stopRows.map((row) => ({
    stopId: row.stop_id,
    stopName: row.stop_name,
    lat: row.stop_lat,
    lon: row.stop_lon,
    routes: routesByStop.get(row.stop_id) ?? [],
  }));

  return new Response(JSON.stringify({ stops }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": prodCacheHeader(),
    },
  });
}
