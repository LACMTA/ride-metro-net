import { getGtfsDb } from "./gtfsConfig";
import { objectToCamel } from "ts-case-convert";
import type Database from "better-sqlite3";
import { resolveRouteShortName } from "./routeShortNameOverrides";

export interface RouteWithInfo {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeType: number;
  routeColor: string;
  routeTextColor: string;
}

interface DatabaseQueryResult {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

let preparedQuery: Database.Statement | null = null;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getGtfsDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

const query = `
    SELECT
      route_id,
      route_short_name,
      route_long_name,
      route_type,
      COALESCE(route_color, '') AS route_color,
      COALESCE(route_text_color, '') AS route_text_color
    FROM routes
    WHERE route_id = @routeId
       OR route_id LIKE @routeId || '-%'
    LIMIT 1
    `;

export default async function (routeId: string) {
  const mainQuery = getPreparedQuery();
  const res = mainQuery.get({ routeId }) as DatabaseQueryResult | undefined;

  if (!res) {
    throw new Error(`Route not found: ${routeId}`);
  }

  const routeIdPrefix = res.route_id.split("-")[0];

  const route: RouteWithInfo = {
    routeId: routeIdPrefix,
    routeShortName: resolveRouteShortName(
      res.route_id,
      res.route_short_name || "",
    ),
    routeLongName: res.route_long_name,
    routeType: res.route_type,
    routeColor: res.route_color,
    routeTextColor: res.route_text_color,
  };

  return route;
}
