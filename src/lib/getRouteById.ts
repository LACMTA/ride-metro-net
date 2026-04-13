import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
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

let dbInstance: Database.Database | null = null;
let preparedQuery: Database.Statement | null = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = openDb(GTFSconfig);

    dbInstance.pragma("synchronous = OFF");
    dbInstance.pragma("cache_size = 10000");
    dbInstance.pragma("temp_store = MEMORY");
    dbInstance.pragma("journal_mode = OFF"); // Safe for in-memory
  }
  return dbInstance;
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
    LIMIT 1
    `;

function getPreparedQuery() {
  if (!preparedQuery) {
    const db = getDb();
    preparedQuery = db.prepare(query);
  }
  return preparedQuery;
}

export default async function (routeId: string) {
  const mainQuery = getPreparedQuery();
  const res = mainQuery.get({ routeId }) as DatabaseQueryResult | undefined;

  if (!res) {
    throw new Error(`Route not found: ${routeId}`);
  }

  const route: RouteWithInfo = {
    routeId: res.route_id,
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
