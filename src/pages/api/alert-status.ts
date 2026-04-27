import { isCurrent } from "../../lib/isCurrent";

export const prerender = false;

/**
 * Shape of a single alert coming back from the Swiftly JSON endpoint.
 * We only care about `informedEntities` (for route IDs) and
 * `activePeriods` (to check whether the alert is current).
 */
interface SwiftlyAlertSummary {
  informedEntities: { routeId?: string; stopId?: string }[];
  activePeriods: { start: string; end: string }[];
}

/** Response type: route-ID prefix → number of active alerts. */
export type AlertStatusMap = Record<string, number>;

/**
 * Fetch all alerts for a single Swiftly agency and return the raw array.
 */
async function fetchAgencyAlerts(
  agency: string,
  apiKey: string,
): Promise<SwiftlyAlertSummary[]> {
  const url = new URL(
    `https://api.goswift.ly/real-time/${agency}/gtfs-rt-alerts/v2`,
  );
  url.searchParams.append("format", "json");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: apiKey,
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    console.error(
      `Swiftly alerts API error for ${agency} (${res.status}):`,
      await res.text(),
    );
    return [];
  }

  return res.json();
}

/**
 * Convert a raw Swiftly alert into the `{ activePeriod }` shape that the
 * shared `isCurrent` helper expects (POSIX seconds).
 */
function toActivePeriod(alert: SwiftlyAlertSummary) {
  const raw = alert.activePeriods?.[0];
  if (!raw)
    return {
      activePeriod: undefined as unknown as { start: number; end: number },
    };
  return {
    activePeriod: {
      start: Math.floor(new Date(raw.start).getTime() / 1000),
      end: Math.floor(new Date(raw.end).getTime() / 1000),
    },
  };
}

/**
 * GET /api/alert-status
 *
 * Returns a JSON object mapping route-ID prefixes to the number of currently
 * active alerts for that route.  Fetches from both `lametro` and
 * `lametro-rail` Swiftly agencies in parallel and merges the results.
 *
 * Example response: `{ "801": 1, "720": 3 }`
 * Routes with zero alerts are omitted.
 */
export async function GET() {
  const API_KEY = import.meta.env.API_KEY;

  const [lametroAlerts, railAlerts] = await Promise.all([
    fetchAgencyAlerts("lametro", API_KEY as string),
    fetchAgencyAlerts("lametro-rail", API_KEY as string),
  ]);

  const allAlerts = [...lametroAlerts, ...railAlerts];
  const counts: AlertStatusMap = {};

  for (const alert of allAlerts) {
    if (!isCurrent(toActivePeriod(alert))) continue;

    // Deduplicate so a single alert is only counted once per route prefix,
    // even if the route appears multiple times in informedEntities.
    const prefixes = new Set(
      alert.informedEntities
        .filter((e) => e.routeId)
        // Strip the GTFS version suffix (e.g. "801-13196" → "801").
        .map((e) => e.routeId!.split("-")[0]),
    );
    for (const prefix of prefixes) {
      counts[prefix] = (counts[prefix] ?? 0) + 1;
    }
  }

  return new Response(JSON.stringify(counts), {
    headers: { "Content-Type": "application/json" },
  });
}
