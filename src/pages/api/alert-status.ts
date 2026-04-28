import { isCurrent } from "../../lib/isCurrent";
import {
  fetchSwiftlyAlerts,
  type SwiftlyAlert,
} from "../../lib/fetchSwiftlyAlerts";

export const prerender = false;

/** Route-ID prefix → number of active alerts. */
export type AlertStatusMap = Record<string, number>;

/** Full shape returned by GET /api/alert-status. */
export interface AlertStatusResponse {
  /** Route-ID prefix → number of currently active alerts. */
  routeAlertCounts: AlertStatusMap;
  /**
   * Stop IDs that appear as `informedEntities` on at least one currently
   * active alert whose `effect` is `"ACCESSIBILITY_ISSUE"`.
   */
  accessibilityAlertStopIds: string[];
}

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
 * Returns a JSON object with two fields:
 *   - `routeAlertCounts` — route-ID prefix → number of currently active alerts.
 *     Routes with zero alerts are omitted.
 *   - `accessibilityAlertStopIds` — deduplicated list of stop IDs that are
 *     `informedEntities` on at least one currently active alert whose
 *     `effect` is `"ACCESSIBILITY_ISSUE"`.
 *
 * Fetches from both `lametro` and `lametro-rail` Swiftly agencies in
 * parallel and merges the results.
 *
 * Example response:
 * ```json
 * { "routeAlertCounts": { "801": 1, "720": 3 }, "accessibilityAlertStopIds": ["12345"] }
 * ```
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
  const routeAlertCounts: AlertStatusMap = {};
  const accessibilityStopIdSet = new Set<string>();

  for (const alert of allAlerts) {
    if (!isCurrent(toActivePeriod(alert))) continue;

    // Deduplicate so a single alert is only counted once per route prefix,
    // even if the route appears multiple times in informedEntities.
    // Route IDs are already normalised to prefix-only by fetchSwiftlyAlerts.
    const prefixes = new Set(
      alert.informedEntities.filter((e) => e.routeId).map((e) => e.routeId!),
    );
    for (const prefix of prefixes) {
      routeAlertCounts[prefix] = (routeAlertCounts[prefix] ?? 0) + 1;
    }

    // Collect stop IDs from accessibility alerts.
    if (alert.effect === "ACCESSIBILITY_ISSUE") {
      for (const entity of alert.informedEntities) {
        if (entity.stopId) {
          accessibilityStopIdSet.add(entity.stopId);
        }
      }
    }
  }

  const body: AlertStatusResponse = {
    routeAlertCounts,
    accessibilityAlertStopIds: [...accessibilityStopIdSet],
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
