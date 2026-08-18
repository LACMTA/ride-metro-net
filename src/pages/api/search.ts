import { searchRoutes, searchStops } from "../../lib/searchRoutesAndStops";
import type { RouteWithInfo } from "../../lib/getRouteById";
import type { BusStop } from "../../lib/getBusStopsForBbox";

export const prerender = false;

const MIN_QUERY_LENGTH = 1;

interface SearchResponse {
  lines: RouteWithInfo[];
  stops: BusStop[];
}

/**
 * GET /api/search?q=<query>
 *
 * Searches Metro routes and stops by name. Returns matching lines (rail,
 * busway, and bus) and stops (with their serving routes for badge rendering).
 *
 * Empty queries return empty arrays. Single-character queries are allowed so
 * that short route names (e.g. bus "2") can be searched.
 */
export async function GET(context: import("astro").APIContext) {
  const query = context.url.searchParams.get("q") ?? "";

  if (query.trim().length < MIN_QUERY_LENGTH) {
    return new Response(
      JSON.stringify({ lines: [], stops: [] } satisfies SearchResponse),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const trimmedQuery = query.trim();

  try {
    const lines = searchRoutes(trimmedQuery);
    const stops = searchStops(trimmedQuery);

    return new Response(
      JSON.stringify({ lines, stops } satisfies SearchResponse),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (err) {
    console.error("Search API error:", err);
    return new Response(
      JSON.stringify({
        error: "Search failed",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
