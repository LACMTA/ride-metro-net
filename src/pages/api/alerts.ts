import { getServiceAlertsFromDb } from "../../lib/getServiceAlerts";
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
 * Reads current GTFS-Realtime service alerts from the node-gtfs SQLite
 * database (kept fresh by the every-minute `gtfs-rt-poller` worker) and
 * returns them as `ConciseAlert[]`. Both `lametro` and `lametro-rail`
 * agencies write into the same SQLite tables, so a single query covers
 * the whole system — including agency-wide alerts.
 *
 * @param {string} [stopId] - Comma-separated list of stop IDs to filter by
 * @param {string} [routeId] - Comma-separated list of route IDs to filter by
 * @returns {ConciseAlert[]} Array of alerts
 */
export async function GET(context: import("astro").APIContext) {
  const rawStopIds = context.url.searchParams.get("stopId")?.split(",") || [];

  // Expand each requested stop ID to also include its child stop IDs
  // (from the build-time GTFS lookup) so alerts tagged on child stops are
  // matched from the parent
  const children = stopLookup.children as Record<string, string[]>;
  const stopIds = rawStopIds.flatMap((id) => [id, ...(children[id] ?? [])]);

  const routeIds = context.url.searchParams.get("routeId")?.split(",") || [];

  let allAlerts: SwiftlyAlert[];
  try {
    allAlerts = await getServiceAlertsFromDb();
  } catch (err) {
    console.error("Failed to read service alerts from SQLite:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to read service alerts from database",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Route IDs in informedEntities are already normalised to prefix-only form
  // by getServiceAlertsFromDb, so simple equality checks work here.
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

  return new Response(JSON.stringify(filteredAlerts), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900",
    },
  });
}