import { isCurrent } from "../../lib/isCurrent";
import { fetchSwiftlyAlerts } from "../../lib/fetchSwiftlyAlerts";
import { makeConciseAlert } from "../../lib/makeConciseAlert";
import stopLookup from "../../generated/railBuswayStopLookup.json";
import type { ConciseAlert } from "./alerts";

export const prerender = false;

/** Route-ID prefix → number of active alerts. */
export type AlertStatusMap = Record<string, number>;

/** A rail/busway stop affected by an accessibility alert. */
export interface AccessibilityAlertStop {
  /** Top-level stop ID (parent station when one exists). */
  stopId: string;
  /** Human-readable station / stop name. */
  stopName: string;
  /** All currently active accessibility alerts affecting this stop. */
  alerts: ConciseAlert[];
}

/** Full shape returned by GET /api/alert-status. */
export interface AlertStatusResponse {
  /** Route-ID prefix → number of currently active alerts. */
  routeAlertCounts: AlertStatusMap;
  /**
   * Rail/busway stops affected by at least one currently active alert whose
   * `effect` is `"ACCESSIBILITY_ISSUE"`, resolved to their top-level station
   * ID and human-readable name via the build-time GTFS lookup.
   */
  accessibilityAlertStops: AccessibilityAlertStop[];
}

const stops = stopLookup.stops as Record<
  string,
  { stopName: string; stationId: string }
>;

/**
 * GET /api/alert-status
 *
 * Returns a JSON object with two fields:
 *   - `routeAlertCounts` — route-ID prefix → number of currently active alerts.
 *     Routes with zero alerts are omitted.
 *   - `accessibilityAlertStops` — deduplicated list of rail/busway stops
 *     affected by at least one currently active `ACCESSIBILITY_ISSUE` alert,
 *     each with a `stopId` (top-level station) and `stopName`.
 *
 * Fetches from both `lametro` and `lametro-rail` Swiftly agencies in
 * parallel and merges the results.
 *
 * Example response:
 * ```json
 * {
 *   "routeAlertCounts": { "801": 1, "720": 3 },
 *   "accessibilityAlertStops": [
 *     { "stopId": "80214S", "stopName": "Union Station" }
 *   ]
 * }
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

  // Deduplicate accessibility stops by their resolved stationId so the same
  // station doesn't appear twice when Swiftly tags both a parent and child.
  // Each entry collects all active alerts for that station.
  const accessibilityStopMap = new Map<string, AccessibilityAlertStop>();

  for (const alert of allAlerts) {
    const conciseAlert = makeConciseAlert(alert);
    if (!isCurrent(conciseAlert)) continue;

    // Deduplicate so a single alert is only counted once per route prefix,
    // even if the route appears multiple times in informedEntities.
    // Route IDs are already normalised to prefix-only by fetchSwiftlyAlerts.
    // Accessibility alerts are surfaced separately and excluded from the count.
    if (alert.effect !== "ACCESSIBILITY_ISSUE") {
      const prefixes = new Set(
        alert.informedEntities.filter((e) => e.routeId).map((e) => e.routeId!),
      );
      for (const prefix of prefixes) {
        routeAlertCounts[prefix] = (routeAlertCounts[prefix] ?? 0) + 1;
      }
    }

    // Collect stop IDs from accessibility alerts, resolved to station names,
    // and attach the full ConciseAlert to each affected station.
    if (alert.effect === "ACCESSIBILITY_ISSUE") {
      for (const entity of alert.informedEntities) {
        if (entity.stopId) {
          const entry = stops[entity.stopId];
          if (entry) {
            const existing = accessibilityStopMap.get(entry.stationId);
            if (existing) {
              if (!existing.alerts.includes(conciseAlert)) {
                existing.alerts.push(conciseAlert);
              }
            } else {
              accessibilityStopMap.set(entry.stationId, {
                stopId: entry.stationId,
                stopName: entry.stopName,
                alerts: [conciseAlert],
              });
            }
          }
        }
      }
    }
  }

  const body: AlertStatusResponse = {
    routeAlertCounts,
    accessibilityAlertStops: [...accessibilityStopMap.values()],
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900",
    },
  });
}
