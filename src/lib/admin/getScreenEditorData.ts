/**
 * Server-only SQLite queries powering the /admin/screens editor API
 * (`src/pages/admin/api/screens/*`).
 *
 * The serving-routes merge mirrors `/screens/[signId]` exactly: each
 * configured stop is resolved through getStopWithRoutes and all returned
 * routes are merged into one flat list (deduped here by stable route-ID
 * prefix for the routeOrder editor).
 */
import { getGtfsDb } from "../gtfsConfig";
import { buildForWebRouteCondition } from "../stopEligibility";
import getStopWithRoutes, { type StopRoute } from "../getStopWithRoutes";
import { ROUTE_SHORT_NAME_OVERRIDES } from "../routeShortNameOverrides";
import { readScreenSignsFile } from "./screenSignsFile";
import type {
  AdminScreenDetail,
  AdminScreenRouteInfo,
  AdminScreenStop,
  AdminScreenStopLookupResult,
  AdminScreenSummary,
} from "./types";

/** Summaries of every configured sign, for the editor's dropdown. */
export function getScreenSummaries(): AdminScreenSummary[] {
  // Prebuild the eligible-stops table (see ensureEligibleStopsTable) here so
  // the add-stop search is instant by the time the user types — the page
  // fetches this list long before any search happens.
  ensureEligibleStopsTable(getGtfsDb());

  const signs = readScreenSignsFile();
  return Object.entries(signs).map(([signId, config]) => ({
    signId,
    stopCount: config.stopIds.length,
    routeOrderCount: config.routeOrder?.length ?? 0,
  }));
}

/** Escapes SQL LIKE wildcards (and the escape char) in a query fragment. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => "\\" + m);
}

/** Module-lifetime flag: the eligible-stops temp table has been built. */
let eligibleStopsReady = false;

/**
 * Builds the temp table of eligible stop IDs once per process — the same
 * set getStopStaticPaths builds pages for (parent stations referenced by
 * child platforms with service, plus platform stops with service). The
 * underlying union scans the full ~3.5M-row stop_times table (several
 * seconds), so it must not run per search request — the same tradeoff
 * searchRoutesAndStops makes for the public search. The table goes stale
 * after a GTFS re-import until the dev server restarts; acceptable for a
 * dev-only tool.
 */
function ensureEligibleStopsTable(db: ReturnType<typeof getGtfsDb>): void {
  if (eligibleStopsReady) return;

  const routeCond = buildForWebRouteCondition("r");
  if (routeCond.params.length === 0) {
    db.exec(
      "CREATE TEMP TABLE IF NOT EXISTS _admin_eligible_stops " +
        "(stop_id TEXT PRIMARY KEY);",
    );
    eligibleStopsReady = true;
    return;
  }

  // Drop any stale temp table from a previous (possibly buggy) invocation
  // so a fresh one is always created with current data.
  db.exec("DROP TABLE IF EXISTS _admin_eligible_stops;");

  db.prepare(
    `
    CREATE TEMP TABLE _admin_eligible_stops AS
      SELECT DISTINCT st.stop_id
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE ${routeCond.clause}

      UNION

      SELECT DISTINCT s.parent_station AS stop_id
      FROM stops s
      JOIN stop_times st ON st.stop_id = s.stop_id
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE s.parent_station IS NOT NULL AND s.parent_station != ''
        AND ${routeCond.clause};
    `,
  ).run(...routeCond.params, ...routeCond.params);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx__admin_eligible_stops " +
      "ON _admin_eligible_stops(stop_id);",
  );

  eligibleStopsReady = true;
}

/**
 * Searches stops by name (substring) or stop ID (prefix), restricted to
 * top-level stops — stops with no `parent_station` of their own (parent
 * stations like Union Station "80214S" plus standalone stops like "3300")
 * that have at least one route from a buildForWeb agency, the same set of
 * stops the site builds pages for. Child platform stops are never returned.
 *
 * Results are ranked for relevance: exact stop-ID match, exact name match,
 * name-prefix match, then substring — parent stations first within each
 * rank, then alphabetically.
 */
export function searchTopLevelStops(
  query: string,
  limit = 20,
): AdminScreenStopLookupResult[] {
  const db = getGtfsDb();
  ensureEligibleStopsTable(db);

  const trimmed = query.trim();
  if (trimmed === "") return [];
  const like = `%${escapeLike(trimmed)}%`;
  const idPrefix = `${escapeLike(trimmed)}%`;
  const namePrefix = `${escapeLike(trimmed)}%`;

  // Anonymous (?) bind params appear in SQL-text order: the main WHERE's
  // LIKE patterns, the ORDER BY rank CASE's params, then the limit.
  const rows = db
    .prepare(
      `
      SELECT s.stop_id, s.stop_name,
        (s.location_type = 1
          OR EXISTS (SELECT 1 FROM stops c WHERE c.parent_station = s.stop_id)
        ) AS is_parent_station
      FROM stops s
      WHERE (s.parent_station IS NULL OR s.parent_station = '')
        AND (s.stop_name LIKE ? ESCAPE '\\' OR s.stop_id LIKE ? ESCAPE '\\')
        AND s.stop_id IN (SELECT stop_id FROM _admin_eligible_stops)
      ORDER BY
        CASE
          WHEN s.stop_id = ? THEN 0
          WHEN LOWER(s.stop_name) = LOWER(?) THEN 1
          WHEN s.stop_name LIKE ? ESCAPE '\\' THEN 2
          ELSE 3
        END,
        is_parent_station DESC,
        s.stop_name,
        s.stop_id
      LIMIT ?
      `,
    )
    .all(like, idPrefix, trimmed, trimmed, namePrefix, limit) as StopRow[];

  return rows.map((row) => ({
    stopId: row.stop_id,
    stopName: row.stop_name,
    isParentStation: Boolean(row.is_parent_station),
  }));
}

interface StopRow {
  stop_id: string;
  stop_name: string;
  is_parent_station: number;
}

/** Resolves stop IDs to name + parent-station info (missing stops absent). */
function getStopRows(stopIds: string[]): Map<string, StopRow> {
  if (stopIds.length === 0) return new Map();
  const db = getGtfsDb();
  const rows = db
    .prepare(
      `
      SELECT s.stop_id, s.stop_name,
        (s.location_type = 1
          OR EXISTS (SELECT 1 FROM stops c WHERE c.parent_station = s.stop_id)
        ) AS is_parent_station
      FROM stops s
      WHERE s.stop_id IN (SELECT value FROM json_each(@idsJson))
      `,
    )
    .all({ idsJson: JSON.stringify([...new Set(stopIds)]) }) as StopRow[];
  return new Map(rows.map((row) => [row.stop_id, row]));
}

interface RouteRow {
  route_id: string;
  route_short_name: string | null;
  route_long_name: string | null;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

/**
 * Resolves stable route-ID prefixes to GTFS route metadata, matching either
 * the bare prefix (rail IDs, e.g. "801") or any suffixed variant (e.g.
 * "33-13167"). The suffix is GTFS-release-specific while the long name /
 * colors / type are stable, so the first match per prefix wins.
 */
function getRouteRows(routeIds: string[]): Map<string, RouteRow> {
  if (routeIds.length === 0) return new Map();
  const db = getGtfsDb();
  const rows = db
    .prepare(
      `
      SELECT r.route_id, r.route_short_name, r.route_long_name, r.route_type,
        COALESCE(r.route_color, '') AS route_color,
        COALESCE(r.route_text_color, '') AS route_text_color
      FROM routes r
      WHERE EXISTS (
        SELECT 1 FROM json_each(@idsJson) j
        WHERE r.route_id = j.value OR r.route_id LIKE j.value || '-%'
      )
      ORDER BY r.route_id
      `,
    )
    .all({ idsJson: JSON.stringify([...new Set(routeIds)]) }) as RouteRow[];
  const byPrefix = new Map<string, RouteRow>();
  for (const row of rows) {
    const prefix = row.route_id.split("-")[0];
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, row);
  }
  return byPrefix;
}

/** Builds an AdminScreenRouteInfo from a GTFS route row. */
function toRouteInfo(prefix: string, row: RouteRow): AdminScreenRouteInfo {
  return {
    routeId: prefix,
    label: row.route_short_name || ROUTE_SHORT_NAME_OVERRIDES[prefix] || prefix,
    longName: row.route_long_name ?? "",
    routeType: row.route_type,
    routeColor: row.route_color,
    routeTextColor: row.route_text_color,
    known: true,
  };
}

/**
 * Merges the routes serving the given stops — the same merge the public
 * sign page performs — deduped by stable route-ID prefix in first-seen
 * order. Stops that don't exist or have no routes are skipped.
 */
export async function getMergedServingRoutes(
  stopIds: string[],
): Promise<AdminScreenRouteInfo[]> {
  const merged: StopRoute[] = [];
  for (const stopId of stopIds) {
    try {
      const stop = await getStopWithRoutes(stopId);
      merged.push(...stop.routes);
    } catch {
      // Stop doesn't exist or has no routes — skipped. Existence is
      // surfaced separately via the detail payload / save validation.
    }
  }

  const byPrefix = new Map<string, StopRoute>();
  for (const route of merged) {
    if (!byPrefix.has(route.routeId)) byPrefix.set(route.routeId, route);
  }
  const routeRows = getRouteRows([...byPrefix.keys()]);

  return [...byPrefix.entries()].map(([prefix, stopRoute]) => {
    const row = routeRows.get(prefix);
    // getStopWithRoutes already resolves the display short name for rail
    // routes; the route row fills in the long name.
    return {
      routeId: prefix,
      label:
        stopRoute.routeShortName ||
        row?.route_short_name ||
        ROUTE_SHORT_NAME_OVERRIDES[prefix] ||
        prefix,
      longName: row?.route_long_name ?? "",
      routeType: stopRoute.routeType,
      routeColor: stopRoute.routeColor,
      routeTextColor: stopRoute.routeTextColor,
      known: true,
    };
  });
}

/**
 * Full editor payload for one sign, or null when the sign doesn't exist.
 */
export async function getScreenDetail(
  signId: string,
): Promise<AdminScreenDetail | null> {
  const config = readScreenSignsFile()[signId];
  if (!config) return null;

  const stopRows = getStopRows(config.stopIds);
  const stops: AdminScreenStop[] = config.stopIds.map((stopId) => {
    const row = stopRows.get(stopId);
    return {
      stopId,
      stopName: row?.stop_name ?? "",
      found: Boolean(row),
      isParentStation: Boolean(row?.is_parent_station),
    };
  });

  const servingRoutes = await getMergedServingRoutes(config.stopIds);

  // Info for saved routeOrder entries that no longer serve the sign —
  // either still-known routes or IDs no longer present in GTFS at all.
  const servingIds = new Set(servingRoutes.map((route) => route.routeId));
  const staleIds = (config.routeOrder ?? []).filter(
    (routeId) => !servingIds.has(routeId),
  );
  const staleRows = getRouteRows(staleIds);
  const staleRoutes: AdminScreenRouteInfo[] = staleIds.map((routeId) => {
    const row = staleRows.get(routeId);
    return row
      ? toRouteInfo(routeId, row)
      : {
          routeId,
          label: routeId,
          longName: "",
          routeType: 3,
          routeColor: "",
          routeTextColor: "",
          known: false,
        };
  });

  return {
    signId,
    config: {
      stopIds: config.stopIds,
      routeOrder: config.routeOrder ?? null,
    },
    stops,
    servingRoutes,
    staleRoutes,
  };
}
