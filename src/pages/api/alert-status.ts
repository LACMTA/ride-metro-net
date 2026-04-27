import { isCurrent } from "../../lib/isCurrent";
import { fetchSwiftlyAlerts, type SwiftlyAlert } from "../../lib/fetchSwiftlyAlerts";

export const prerender = false;

/** Response type: route-ID prefix → number of active alerts. */
export type AlertStatusMap = Record<string, number>;

/**
 * Convert a normalised SwiftlyAlert into the `{ activePeriod }` shape that the
 * shared `isCurrent` helper expects (POSIX seconds).
 */
function toActivePeriod(alert: SwiftlyAlert) {
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

  const [lametroResult, railResult] = await Promise.all([
    fetchSwiftlyAlerts("lametro", API_KEY as string),
    fetchSwiftlyAlerts("lametro-rail", API_KEY as string),
  ]);

  // Silently treat upstream failures as empty — alert-status is best-effort.
  const lametroAlerts = lametroResult.ok ? lametroResult.alerts : [];
  const railAlerts = railResult.ok ? railResult.alerts : [];

  const allAlerts = [...lametroAlerts, ...railAlerts];
  const counts: AlertStatusMap = {};

  for (const alert of allAlerts) {
    if (!isCurrent(toActivePeriod(alert))) continue;

    // Deduplicate so a single alert is only counted once per route prefix,
    // even if the route appears multiple times in informedEntities.
    // Route IDs are already normalised to prefix-only by fetchSwiftlyAlerts.
    const prefixes = new Set(
      alert.informedEntities
        .filter((e) => e.routeId)
        .map((e) => e.routeId!),
    );
    for (const prefix of prefixes) {
      counts[prefix] = (counts[prefix] ?? 0) + 1;
    }
  }

  return new Response(JSON.stringify(counts), {
    headers: { "Content-Type": "application/json" },
  });
}
