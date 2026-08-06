import { getGtfsDb } from "./gtfsConfig";
import {
  resolveRouteShortName,
  buswayRouteSqlCondition,
} from "./routeShortNameOverrides";
import { getAgencyIdsByFlag, getAgencySettings } from "./agencies";
import type { RouteWithInfo } from "./getRouteById";

interface DbRow {
  agency_id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

/**
 * Returns one RouteWithInfo per distinct numeric route-ID prefix for all
 * regular bus lines (route_type = 3), excluding the busway lines (G / J,
 * prefixes 901 and 910), where route_short_name contains only digits and
 * forward-slash characters (e.g. "4", "720", "2/302").
 */
export default async function getAllBusRoutes(): Promise<RouteWithInfo[]> {
  const db = getGtfsDb();

  const agencyIds = getAgencyIdsByFlag("showInAlertsIndex");
  const placeholders = agencyIds.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `
      SELECT
        r.agency_id,
        r.route_id,
        r.route_short_name,
        r.route_long_name,
        r.route_type,
        COALESCE(r.route_color, '')      AS route_color,
        COALESCE(r.route_text_color, '') AS route_text_color
      FROM routes r
      JOIN trips t ON t.route_id = r.route_id
      WHERE r.agency_id IN (${placeholders})
        AND r.route_type = 3
        AND ${buswayRouteSqlCondition("r.route_id", false)}
        AND r.route_short_name GLOB '[0-9/]*'
        AND LENGTH(r.route_short_name) > 0
      ORDER BY CAST(r.route_short_name AS INTEGER), r.route_short_name
      `,
    )
    .all(...agencyIds) as DbRow[];

  // Deduplicate by numeric prefix (e.g. "720-13196" → "720"), keeping the
  // first row encountered for each prefix.
  const seen = new Set<string>();
  const unique: DbRow[] = [];
  for (const row of rows) {
    const prefix = row.route_id.split("-")[0];
    if (!seen.has(prefix)) {
      seen.add(prefix);
      unique.push(row);
    }
  }

  return unique.map((row) => {
    const prefix = row.route_id.split("-")[0];
    return {
      routeId: prefix,
      routeShortName: resolveRouteShortName(
        row.route_id,
        row.route_short_name || "",
      ),
      routeLongName: row.route_long_name,
      routeType: row.route_type,
      routeColor: row.route_color,
      routeTextColor: row.route_text_color,
      defaultLineColor: getAgencySettings(row.agency_id)?.lineColor ?? "",
    };
  });
}
