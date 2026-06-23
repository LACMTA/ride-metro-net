import { getServiceAlerts as gtfsGetServiceAlerts } from "gtfs";
import { getGtfsDb } from "./gtfsConfig";

/**
 * Server-side helper that reads the current GTFS-Realtime service alerts
 * from the node-gtfs SQLite database (kept fresh by the every-minute
 * `gtfs-rt-poller` worker) and maps them into the `Alert` shape that
 * `makeConciseAlert` and the rest of the app already consume.
 */

/**
 * Strip the GTFS version suffix from a route ID.
 *
 * ```
 * routeIdPrefix("901-13196") // → "901"
 * routeIdPrefix("901")       // → "901"
 * ```
 */
function routeIdPrefix(routeId: string): string {
  return routeId.split("-")[0];
}

/** Entity attached to an alert (after normalization). */
export interface AlertEntity {
  routeId?: string;
  stopId?: string;
  agencyId: string;
}

/** Shape of a single alert returned by `getServiceAlertsFromDb`. */
export interface Alert {
  informedEntities: AlertEntity[];
  activePeriods: { start: string; end: string | null }[];
  headerText: string;
  descriptionText: string;
  effect: string;
  cause: string;
}

/** Parsed shape of the `active_period` JSON column. */
interface ActivePeriodRow {
  start?: number;
  end?: number | null;
}

function toAlert(
  row: ReturnType<typeof gtfsGetServiceAlerts>[number],
): Alert {
  const informedEntities: AlertEntity[] = row.informed_entities.map(
    (entity) => ({
      routeId: entity.route_id ? routeIdPrefix(entity.route_id) : undefined,
      stopId: entity.stop_id ?? undefined,
      // node-gtfs does not store an agencyId on informed entities; alerts
      // with only a route_type (no route/stop/trip) are treated as
      // system-wide downstream, so leave agencyId empty to match.
      agencyId: "",
    }),
  );

  // active_period is a JSON string from node-gtfs; fall back to the
  // start_time/end_time columns if it is missing/unparseable.
  let active: ActivePeriodRow | null = null;
  if (row.active_period) {
    try {
      const parsed = JSON.parse(row.active_period);
      // node-gtfs stores activePeriod as an array of { start, end }.
      active = Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
    } catch {
      active = null;
    }
  }

  const start =
    active?.start != null
      ? new Date(active.start * 1000).toISOString()
      : (row.start_time ?? new Date().toISOString());
  const end =
    active?.end != null
      ? new Date(active.end * 1000).toISOString()
      : (row.end_time ?? null);

  let effect = row.effect ?? "";
  let headerText = row.header_text ?? "";
  let descriptionText = row.description_text ?? "";

  // TEMPORARY FIX: the feed does not always carry "ACCESSIBILITY_ISSUE"
  // as an effect. Until that is solved upstream, override the effect to
  // "ACCESSIBILITY_ISSUE" whenever the alert header or description
  // mentions "elevator" or "escalator".
  const accessibilityKeywords = /elevator|escalator/i;
  if (
    accessibilityKeywords.test(headerText) ||
    accessibilityKeywords.test(descriptionText)
  ) {
    effect = "ACCESSIBILITY_ISSUE";
  }

  return {
    informedEntities,
    activePeriods: [{ start, end }],
    headerText,
    descriptionText,
    effect,
    cause: row.cause ?? "",
  };
}

/**
 * Return all currently-active service alerts across every configured
 * agency, mapped to the `Alert` shape.
 */
export async function getServiceAlertsFromDb(): Promise<Alert[]> {
  const db = getGtfsDb();
  const nowSeconds = Math.floor(Date.now() / 1000);

  // node-gtfs' getServiceAlerts accepts an optional `db` via options,
  // but the TS signature types `options` as `QueryOptions` which does
  // include `db`. Fetch all rows in one go; expiration filtering is
  // applied here so we never surface stale rows even if the poller is
  // mid-cycle.
  const rows = gtfsGetServiceAlerts({}, [], [], { db });

  const active = rows.filter((row) => row.expiration_timestamp > nowSeconds);

  return active.map(toAlert);
}