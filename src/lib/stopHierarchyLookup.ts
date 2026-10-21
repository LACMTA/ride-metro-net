import { getGtfsDb } from "./gtfsConfig";
import type Database from "better-sqlite3";

/**
 * Generic helpers for resolving GTFS stop hierarchy (parent station ↔
 * child platform) relationships directly from the `stops` table at
 * runtime.
 *
 * The `stops` table is small and the SQLite pragmas applied in `gtfsConfig`
 * (`synchronous=OFF`, `cache_size=10000`, `temp_store=MEMORY`) make these
 * point queries essentially free, so no in-memory cache is needed.
 */

export interface StopInfo {
  stopName: string;
  stationId: string;
}

// Because better-sqlite3 requires the exact number of `?` placeholders in
// an IN() clause, we prepare (and cache) a statement per distinct argument
// count using small Maps.  In practice the counts are small and stable.

const childStopsCache = new Map<number, Database.Statement>();
const stopInfoCache = new Map<number, Database.Statement>();

function placeholders(n: number): string {
  return Array(n).fill("?").join(",");
}

function getChildStopsStmt(n: number): Database.Statement {
  let stmt = childStopsCache.get(n);
  if (!stmt) {
    const db = getGtfsDb();
    stmt = db.prepare(
      `SELECT stop_id FROM stops WHERE parent_station IN (${placeholders(n)})`,
    );
    childStopsCache.set(n, stmt);
  }
  return stmt;
}

function getStopInfoStmt(n: number): Database.Statement {
  let stmt = stopInfoCache.get(n);
  if (!stmt) {
    const db = getGtfsDb();
    stmt = db.prepare(`
      SELECT
        s.stop_id                              AS stop_id,
        COALESCE(p.stop_name, s.stop_name)     AS stop_name,
        COALESCE(s.parent_station, s.stop_id) AS station_id
      FROM stops s
      LEFT JOIN stops p ON p.stop_id = s.parent_station
      WHERE s.stop_id IN (${placeholders(n)})
    `);
    stopInfoCache.set(n, stmt);
  }
  return stmt;
}

/**
 * Given one or more parent stop IDs, return all child (platform) stop IDs.
 * Returns an empty array when none of the IDs are parents.
 */
export function getChildStopIds(parentStopIds: string[]): string[] {
  if (parentStopIds.length === 0) return [];
  const stmt = getChildStopsStmt(parentStopIds.length);
  const rows = stmt.all(...parentStopIds) as { stop_id: string }[];
  return rows.map((r) => r.stop_id);
}

/**
 * Given a set of stop IDs, return each one's human-readable name and
 * parent station ID (or itself when standalone).
 *
 * Returns a `Map<stopId, StopInfo>` for O(1) lookups by the caller.
 */
export function getStopInfo(stopIds: string[]): Map<string, StopInfo> {
  const result = new Map<string, StopInfo>();
  if (stopIds.length === 0) return result;

  const stmt = getStopInfoStmt(stopIds.length);
  const rows = stmt.all(...stopIds) as {
    stop_id: string;
    stop_name: string;
    station_id: string;
  }[];

  for (const row of rows) {
    result.set(row.stop_id, {
      stopName: row.stop_name,
      stationId: row.station_id,
    });
  }
  return result;
}