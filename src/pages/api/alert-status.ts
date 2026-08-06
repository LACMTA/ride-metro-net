import { getServiceAlertsFromDb } from "../../lib/getServiceAlerts";
import type { Alert } from "../../lib/getServiceAlerts";
import { makeConciseAlert } from "../../lib/makeConciseAlert";
import { getStopInfo } from "../../lib/stopHierarchyLookup";
import { isCurrent } from "../../lib/isCurrent";
import { getAgencyIdsByFlag } from "../../lib/agencies";
import type { ConciseAlert } from "./alerts";
import { prodCacheHeader } from "../../lib/prodCacheHeader";

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
   * ID and human-readable name via the GTFS `stops` table.
   */
  accessibilityAlertStops: AccessibilityAlertStop[];
}

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
 *
 * Example response:
 * ```json
 * {
 *   "routeAlertCounts": { "801": 1, "720": 3 },
 *   "accessibilityAlertStops": [
 *     { "stopId": "80214S", "stopName": "Union Station", "alerts": [...] }
 *   ]
 * }
 * ```
 */
export async function GET() {
  let allAlerts: Alert[];
  try {
    allAlerts = await getServiceAlertsFromDb({
      agencyIds: getAgencyIdsByFlag("showInAlertsIndex"),
    });
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

  const routeAlertCounts: AlertStatusMap = {};

  const accessibilityAlerts: { alert: Alert; concise: ConciseAlert }[] = [];
  const stopIdsToResolve = new Set<string>();

  for (const alert of allAlerts) {
    const conciseAlert = makeConciseAlert(alert);
    if (!isCurrent(conciseAlert)) continue;

    // Deduplicate so a single alert is only counted once per route prefix,
    // even if the route appears multiple times in informedEntities.
    // Accessibility alerts are surfaced separately and excluded from the count.
    if (alert.effect !== "ACCESSIBILITY_ISSUE") {
      const prefixes = new Set(
        alert.informedEntities.filter((e) => e.routeId).map((e) => e.routeId!),
      );
      for (const prefix of prefixes) {
        routeAlertCounts[prefix] = (routeAlertCounts[prefix] ?? 0) + 1;
      }
    }

    // Collect stop IDs from accessibility alerts for batch resolution.
    if (alert.effect === "ACCESSIBILITY_ISSUE") {
      for (const entity of alert.informedEntities) {
        if (entity.stopId) {
          stopIdsToResolve.add(entity.stopId);
          accessibilityAlerts.push({ alert, concise: conciseAlert });
        }
      }
    }
  }

  const accessibilityStopMap = new Map<string, AccessibilityAlertStop>();

  // Batch-resolve all stop IDs → { stopName, stationId } from the GTFS DB.
  const stopInfoMap = getStopInfo([...stopIdsToResolve]);

  for (const { alert, concise: conciseAlert } of accessibilityAlerts) {
    for (const entity of alert.informedEntities) {
      if (!entity.stopId) continue;
      const info = stopInfoMap.get(entity.stopId);
      if (!info) continue;

      const existing = accessibilityStopMap.get(info.stationId);
      if (existing) {
        if (!existing.alerts.includes(conciseAlert)) {
          existing.alerts.push(conciseAlert);
        }
      } else {
        accessibilityStopMap.set(info.stationId, {
          stopId: info.stationId,
          stopName: info.stopName,
          alerts: [conciseAlert],
        });
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
      "Cache-Control": prodCacheHeader(900),
    },
  });
}
