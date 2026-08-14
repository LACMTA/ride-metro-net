import { getGtfsDb } from "./gtfsConfig";
import {
  resolveRouteShortName,
  buswayRouteSqlCondition,
} from "./routeShortNameOverrides";
import { getAgencyIdsByFlag, getAgencySettings } from "./agencies";
import type { RouteWithInfo } from "./getRouteById";

interface DbRow {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
  agency_id: string;
}

/**
 * Returns one RouteWithInfo per distinct numeric route-ID prefix for all
 * rail lines (route_type != 3) and the two busway lines (G / J, prefixes
 * 901 and 910) that have at least one trip in the schedule.
 *
 * Busway routes are GTFS type 3 but are operated on dedicated busways and
 * displayed alongside rail lines throughout the app.
 */
export default async function getAllRailBuswayRoutes(): Promise<
  RouteWithInfo[]
> {
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
        AND (
          r.route_type != 3
          OR ${buswayRouteSqlCondition("r.route_id", true)}
        )
      ORDER BY r.route_id
      `,
    )
    .all(...agencyIds) as DbRow[];

  // Deduplicate by numeric prefix (e.g. "801-13196" → "801"), keeping the
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
    const agencySettings = getAgencySettings(row.agency_id);
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
      defaultLineColor: agencySettings?.lineColor ?? "",
    };
  });
}
