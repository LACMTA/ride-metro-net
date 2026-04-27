/**
 * Shared utility for fetching and normalizing alerts from the Swiftly
 * real-time alerts API.
 *
 * Swiftly returns route IDs with a GTFS version suffix (e.g. "901-13196").
 * Our app uses only the stable numeric prefix (e.g. "901") everywhere — in
 * URLs, DB lookups, and client-side stores.  This module strips the suffix
 * at the fetch boundary so every downstream consumer sees consistent IDs.
 */

/**
 * Strip the GTFS version suffix from a route ID.
 *
 * ```
 * routeIdPrefix("901-13196") // → "901"
 * routeIdPrefix("901")       // → "901"
 * ```
 */
export function routeIdPrefix(routeId: string): string {
  return routeId.split("-")[0];
}

/** Entity attached to a Swiftly alert (after normalization). */
export interface SwiftlyAlertEntity {
  routeId?: string;
  stopId?: string;
}

/**  Shape of a single alert coming back from the Swiftly JSON endpoint. */
export interface SwiftlyAlert {
  informedEntities: SwiftlyAlertEntity[];
  activePeriods: { start: string; end: string }[];
  headerText: string;
  descriptionText: string;
  effect: string;
  cause: string;
}

/** Discriminated result so callers can handle errors in their own way. */
export type FetchAlertsResult =
  | { ok: true; alerts: SwiftlyAlert[] }
  | { ok: false; status: number; errorText: string };

/**
 * Fetch all alerts for a single Swiftly agency, normalise route IDs in
 * `informedEntities`, and return the result.
 *
 * On HTTP failure the discriminated `ok: false` branch carries the upstream
 * status and body so each caller can decide how to surface the error.
 */
export async function fetchSwiftlyAlerts(
  agency: string,
  apiKey: string,
): Promise<FetchAlertsResult> {
  const url = new URL(
    `https://api.goswift.ly/real-time/${agency}/gtfs-rt-alerts/v2`,
  );
  url.searchParams.append("format", "json");

  console.log(`Fetching alerts from: ${url.toString()}`);

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
    const errorText = await res.text();
    console.error(
      `Swiftly alerts API error for ${agency} (${res.status}):`,
      errorText,
    );
    return { ok: false, status: res.status, errorText };
  }

  const raw: SwiftlyAlert[] = await res.json();

  // Normalise route IDs at the boundary — strip version suffixes so the rest
  // of the app only ever sees the stable numeric prefix.
  for (const alert of raw) {
    for (const entity of alert.informedEntities) {
      if (entity.routeId) {
        entity.routeId = routeIdPrefix(entity.routeId);
      }
    }
  }

  // TEMPORARY FIX: Swiftly does not support "ACCESSIBILITY_ISSUE"
  // as an effect currelty. Until this is solved, override the effect
  // to "ACCESSIBILITY_ISSUE" whenever the alert header or description
  // mentions "elevator" or "escalator".
  const accessibilityKeywords = /elevator|escalator/i;
  for (const alert of raw) {
    if (
      accessibilityKeywords.test(alert.headerText) ||
      accessibilityKeywords.test(alert.descriptionText)
    ) {
      alert.effect = "ACCESSIBILITY_ISSUE";
    }
  }

  return { ok: true, alerts: raw };
}
