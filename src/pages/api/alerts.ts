import {
  fetchSwiftlyAlerts,
  type SwiftlyAlert,
} from "../../lib/fetchSwiftlyAlerts";
import stopLookup from "../../generated/railBuswayStopLookup.json";

export const prerender = false;

// activePeriod matches the GTFS spec: a single object with POSIX timestamps.
export type ConciseAlert = Pick<
  SwiftlyAlert,
  "headerText" | "descriptionText" | "effect" | "cause" | "informedEntities"
> & {
  activePeriod: { start: number; end: number };
};

/**
 * GET /api/alerts
 * @param {string} [stopId] - Comma-separated list of stop IDs to filter by
 * @param {string} [routeId] - Comma-separated list of route IDs to filter by
 * @returns {ConciseAlert[]} Array of alerts
 */
export async function GET(context: import("astro").APIContext) {
  const API_KEY = import.meta.env.API_KEY;

  const rawStopIds = context.url.searchParams.get("stopId")?.split(",") || [];

  // Expand each requested stop ID to also include its child stop IDs
  // (from the build-time GTFS lookup) so alerts tagged on child stops are
  // matched from the parent
  const children = stopLookup.children as Record<string, string[]>;
  const stopIds = rawStopIds.flatMap((id) => [id, ...(children[id] ?? [])]);

  const routeIds = context.url.searchParams.get("routeId")?.split(",") || [];
  const agency = context.url.searchParams.get("agency");

  if (!agency)
    return new Response("agency query parameter is required", { status: 400 });

  const result = await fetchSwiftlyAlerts(agency, API_KEY as string);

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: "External API request failed",
        status: result.status,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 502, // Bad Gateway - external service issue
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const makeConciseAlert = (fullAlert: SwiftlyAlert): ConciseAlert => {
    const rawPeriod = fullAlert.activePeriods[0];
    return {
      // Convert Swiftly's JS datetime strings to POSIX timestamps (seconds) as the GTFS spec requires.
      activePeriod: {
        start: Math.floor(new Date(rawPeriod.start).getTime() / 1000),
        end: Math.floor(new Date(rawPeriod.end).getTime() / 1000),
      },
      headerText: fullAlert.headerText,
      descriptionText: fullAlert.descriptionText,
      effect: fullAlert.effect,
      cause: fullAlert.cause,
      informedEntities: fullAlert.informedEntities,
    };
  };

  // Route IDs in informedEntities are already normalised to prefix-only form
  // by fetchSwiftlyAlerts, so simple equality checks work here.
  const filteredAlerts = result.alerts.reduce<ConciseAlert[]>((acc, alert) => {
    const matchesStop = stopIds.some((stopId) =>
      alert.informedEntities.some((entity) => entity.stopId === stopId),
    );

    if (matchesStop) {
      acc.push(makeConciseAlert(alert));
      return acc;
    }

    const matchesRoute = routeIds.some((routeId) =>
      alert.informedEntities.some((entity) => entity.routeId === routeId),
    );

    if (matchesRoute) {
      acc.push(makeConciseAlert(alert));
    }
    return acc;
  }, []);

  return new Response(JSON.stringify(filteredAlerts));
}
