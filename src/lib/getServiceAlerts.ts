import { getGtfsDb } from "./gtfsConfig";

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

/** Shape of a single alert returned by `getServiceAlertsFromDb`. */
export interface Alert {
  informedEntities: { routeId?: string; stopId?: string; agencyId: string }[];
  activePeriods: { start: string; end: string | null }[];
  headerText: string;
  descriptionText: string;
  effect: string;
  cause: string;
}

interface RawAlertRow {
  id: string;
  active_period: string | null;
  start_time: string | null;
  end_time: string | null;
  header_text: string;
  description_text: string;
  effect: string | null;
  cause: string | null;
}

interface RawEntityRow {
  alert_id: string;
  route_id: string | null;
  stop_id: string | null;
}

function toAlert(row: RawAlertRow, entities: RawEntityRow[]): Alert {
  const informedEntities = entities.map((entity) => ({
    routeId: entity.route_id ? routeIdPrefix(entity.route_id) : undefined,
    stopId: entity.stop_id ?? undefined,
    // node-gtfs does not store an agencyId on informed entities; alerts
    // with only a route_type (no route/stop/trip) are treated as
    // system-wide downstream, so leave agencyId empty to match.
    agencyId: "",
  }));

  // active_period is a JSON string from node-gtfs; fall back to the
  // start_time/end_time columns if it is missing/unparseable.
  let active: { start?: number; end?: number | null } | null = null;
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
  const headerText = row.header_text ?? "";
  const descriptionText = row.description_text ?? "";

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
 * Fetch alert rows from `service_alerts` that are still active (not expired).
 * When a `filter` is provided an EXISTS subquery restricts the result set to
 * alerts whose informed entities match the requested routes or stops — the
 * filtering happens entirely in SQLite rather than in JS.
 */
function fetchAlertRows(
  db: ReturnType<typeof getGtfsDb>,
  nowSeconds: number,
  filter?: { routeIds?: string[]; stopIds?: string[]; agencyIds?: string[] },
): RawAlertRow[] {
  const hasRoutes = (filter?.routeIds?.length ?? 0) > 0;
  const hasStops = (filter?.stopIds?.length ?? 0) > 0;
  const hasAgencies = (filter?.agencyIds?.length ?? 0) > 0;

  if (!hasRoutes && !hasStops && !hasAgencies) {
    // No filter — return every non-expired alert.
    return db
      .prepare(`SELECT * FROM service_alerts WHERE expiration_timestamp > ?`)
      .all(nowSeconds) as RawAlertRow[];
  }

  // Build the inner WHERE conditions for service_alert_informed_entities.
  const entityConditions: string[] = [];
  const params: (string | number)[] = [nowSeconds, nowSeconds];

  for (const routeId of filter!.routeIds ?? []) {
    // Match both the bare prefix ("901") and the suffixed form ("901-13196").
    entityConditions.push(`(saie.route_id = ? OR saie.route_id LIKE ?)`);
    params.push(routeId, `${routeId}-%`);
  }
  for (const stopId of filter!.stopIds ?? []) {
    entityConditions.push(`saie.stop_id = ?`);
    params.push(stopId);
  }
  if (hasAgencies) {
    const agencyPlaceholders = filter!.agencyIds!.map(() => "?").join(", ");
    entityConditions.push(`
      EXISTS (
        SELECT 1 FROM routes r
        WHERE r.route_id = saie.route_id
          AND r.agency_id IN (${agencyPlaceholders})
      )
    `);
    params.push(...filter!.agencyIds!);
  }

  return db
    .prepare(
      `SELECT sa.*
       FROM service_alerts sa
       WHERE sa.expiration_timestamp > ?
         AND EXISTS (
           SELECT 1
           FROM service_alert_informed_entities saie
           WHERE saie.alert_id = sa.id
             AND saie.expiration_timestamp > ?
             AND (${entityConditions.join(" OR ")})
         )`,
    )
    .all(params) as RawAlertRow[];
}

/**
 * Fetch all `service_alert_informed_entities` rows for a given set of alert
 * IDs and group them by `alert_id`.
 */
function fetchEntitiesByAlertId(
  db: ReturnType<typeof getGtfsDb>,
  alertIds: string[],
): Map<string, RawEntityRow[]> {
  if (alertIds.length === 0) return new Map();

  const placeholders = alertIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT * FROM service_alert_informed_entities WHERE alert_id IN (${placeholders})`,
    )
    .all(alertIds) as RawEntityRow[];

  const map = new Map<string, RawEntityRow[]>();
  for (const row of rows) {
    const group = map.get(row.alert_id);
    if (group) {
      group.push(row);
    } else {
      map.set(row.alert_id, [row]);
    }
  }
  return map;
}

/**
 * Return currently-active service alerts, mapped to the `Alert` shape.
 *
 * Pass a filter to restrict results to specific routes (`routeIds`, as
 * prefix-form IDs like `"901"`) or stops (`stopIds`); the filtering is
 * executed inside SQLite rather than after fetching all rows.  Omit the
 * filter (or pass `undefined`) to retrieve every active alert — appropriate
 * for callers like `/api/alert-status` that need a system-wide view.
 */
export async function getServiceAlertsFromDb(filter?: {
  routeIds?: string[];
  stopIds?: string[];
  agencyIds?: string[];
}): Promise<Alert[]> {
  const db = getGtfsDb();
  const nowSeconds = Math.floor(Date.now() / 1000);

  const alertRows = fetchAlertRows(db, nowSeconds, filter);
  if (alertRows.length === 0) return [];

  const alertIds = alertRows.map((row) => row.id);
  const entitiesByAlertId = fetchEntitiesByAlertId(db, alertIds);

  return alertRows.map((row) =>
    toAlert(row, entitiesByAlertId.get(row.id) ?? []),
  );
}
