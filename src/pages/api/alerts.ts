import { getServiceAlertsFromDb } from "../../lib/getServiceAlerts";
import type { Alert } from "../../lib/getServiceAlerts";
import { makeConciseAlert } from "../../lib/makeConciseAlert";
import { getChildStopIds } from "../../lib/stopHierarchyLookup";
import { prodCacheHeader } from "../../lib/prodCacheHeader";

export const prerender = false;

// activePeriod matches the GTFS spec: a single object with POSIX timestamps.
export type ConciseAlert = Pick<
  Alert,
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
 * @param {string} [stopId] - Comma-separated list of stop IDs to filter by
 * @param {string} [routeId] - Comma-separated list of route IDs to filter by
 * @returns {ConciseAlert[]} Array of alerts
 */
export async function GET(context: import("astro").APIContext) {
  const rawStopIds = context.url.searchParams.get("stopId")?.split(",") || [];

  // Expand each requested stop ID to also include its child stop IDs
  // (queried directly from the GTFS stops table) so alerts tagged on
  // child stops are matched from the parent.
  const stopIds = [...rawStopIds, ...getChildStopIds(rawStopIds)];

  const routeIds = context.url.searchParams.get("routeId")?.split(",") || [];

  let alerts: Awaited<ReturnType<typeof getServiceAlertsFromDb>>;
  try {
    // Route IDs are already in prefix-only form from the query string;
    // getServiceAlertsFromDb handles the DB-side LIKE expansion for the
    // suffixed form stored in service_alert_informed_entities.
    alerts = await getServiceAlertsFromDb({ routeIds, stopIds });
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

  return new Response(JSON.stringify(alerts.map(makeConciseAlert)), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": prodCacheHeader(900),
    },
  });
}
