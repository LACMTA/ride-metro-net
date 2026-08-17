import { findNearbyStops } from "../../lib/searchRoutesAndStops";
import type { BusStop } from "../../lib/getBusStopsForBbox";
import type { RouteWithInfo } from "../../lib/getRouteById";

export const prerender = false;

interface NearbyResponse {
  stops: BusStop[];
  /** Deduplicated routes serving the nearby stops, for the "lines" subheader. */
  lines: RouteWithInfo[];
}

/**
 * GET /api/nearby?lat=<lat>&lon=<lon>
 *
 * Returns the nearest stops to the given coordinate, each enriched with
 * serving routes for badge rendering. Also returns a deduplicated list of
 * all routes serving those stops, so the sidebar can display lines first
 * and stops below with subheaders.
 */
export async function GET(context: import("astro").APIContext) {
  const latStr = context.url.searchParams.get("lat");
  const lonStr = context.url.searchParams.get("lon");

  if (!latStr || !lonStr) {
    return new Response(
      JSON.stringify({ error: "lat and lon parameters are required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);

  if (isNaN(lat) || isNaN(lon)) {
    return new Response(
      JSON.stringify({ error: "lat and lon must be valid numbers" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Basic range validation.
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(
      JSON.stringify({ error: "lat/lon out of valid range" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const stops = findNearbyStops(lat, lon);

    // Deduplicate routes from the nearby stops.
    const seenRouteIds = new Set<string>();
    const lines: RouteWithInfo[] = [];
    for (const stop of stops) {
      for (const route of stop.routes) {
        if (!seenRouteIds.has(route.routeId)) {
          seenRouteIds.add(route.routeId);
          lines.push({
            routeId: route.routeId,
            routeShortName: route.routeShortName,
            routeLongName: "", // Not available from BusRouteInfo; the sidebar
            // displays the badge + short name only.
            routeType: route.routeType,
            routeColor: route.routeColor,
            routeTextColor: route.routeTextColor,
            defaultLineColor: "",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ stops, lines } satisfies NearbyResponse),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (err) {
    console.error("Nearby API error:", err);
    return new Response(
      JSON.stringify({
        error: "Nearby search failed",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
