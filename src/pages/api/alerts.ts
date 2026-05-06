import { fetchSwiftlyAlerts } from "../../lib/fetchSwiftlyAlerts";
import { makeConciseAlert } from "../../lib/makeConciseAlert";
import stopLookup from "../../generated/railBuswayStopLookup.json";
import type { SwiftlyAlert } from "../../lib/fetchSwiftlyAlerts";

export const prerender = false;

// activePeriod matches the GTFS spec: a single object with POSIX timestamps.
export type ConciseAlert = Pick<
  SwiftlyAlert,
  "headerText" | "descriptionText" | "effect" | "cause" | "informedEntities"
> & {
  activePeriod: { start: number; end: number | null };
};

/**
 * GET /api/alerts
 *
 * Always fetches alerts from both `lametro` and `lametro-rail` agencies in
 * parallel so system-wide alerts (those with `agencyId` set) from either
 * agency are always included in the response.
 *
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

  // Always fetch from both agencies in parallel — system-wide alerts can be
  // published under either agency, and route/stop data merges cleanly across
  // the two GTFS feeds.
  const [lametroResult, railResult] = await Promise.all([
    fetchSwiftlyAlerts("lametro", API_KEY as string),
    fetchSwiftlyAlerts("lametro-rail", API_KEY as string),
  ]);

  // Only treat it as a hard failure when both agencies are unavailable.
  if (!lametroResult.ok && !railResult.ok) {
    return new Response(
      JSON.stringify({
        error: "External API request failed",
        status: lametroResult.status,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 502, // Bad Gateway - external service issue
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const allAlerts = [
    ...(lametroResult.ok ? lametroResult.alerts : []),
    ...(railResult.ok ? railResult.alerts : []),
  ];

  // Route IDs in informedEntities are already normalised to prefix-only form
  // by fetchSwiftlyAlerts, so simple equality checks work here.
  const filteredAlerts = allAlerts.reduce<ConciseAlert[]>((acc, alert) => {
    // Always include alerts that have an agencyId set on any informed entity.
    // These are system-wide alerts.
    const matchesAgency = alert.informedEntities.some(
      (entity) => entity.agencyId != null && entity.agencyId !== "",
    );

    if (matchesAgency) {
      acc.push(makeConciseAlert(alert));
      return acc;
    }

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
