import { importGtfs, openDb, type Config } from "gtfs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DB_PATH = "./data/data.db";

const agencies: Config["agencies"] = [
  {
    // train
    url: "https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip?ref_type=heads&inline=false",
  },
  {
    // bus
    url: "https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip?ref_type=heads&inline=false",
  },
];

export function buildGtfsConfig(sqlitePath: string): Config {
  return {
    sqlitePath,
    agencies,
    verbose: true,
    ignoreDuplicates: true,
  };
}

const isDev = process.argv.includes("dev");

export const GTFSconfig = buildGtfsConfig(isDev ? DB_PATH : ":memory:");

/** Path to the generated stop-name lookup consumed by SSR API routes. */
const STOP_LOOKUP_PATH = resolve("src/generated/railBuswayStopLookup.json");

/**
 * Query the GTFS database for all rail (route_type 0/1) and busway (901/910)
 * stops — both parent stations and child platforms — and write a JSON lookup
 * file that SSR endpoints can import at runtime.
 *
 * Shape:
 * ```json
 * {
 *   "stops":    { "<stopId>": { "stopName": "…", "stationId": "…" }, … },
 *   "children": { "<parentId>": ["<childId>", …], … }
 * }
 * ```
 */
function generateStopLookup(config: Config): void {
  const db = openDb(config);

  // All stop IDs that directly serve rail or busway routes.
  const directStopRows = db
    .prepare(
      `
      SELECT DISTINCT st.stop_id
      FROM stop_times st
      JOIN trips t ON t.trip_id = st.trip_id
      JOIN routes r ON r.route_id = t.route_id
      WHERE r.route_type IN (0, 1)
         OR r.route_id LIKE '901%'
         OR r.route_id LIKE '910%'
      `,
    )
    .all() as { stop_id: string }[];

  const directStopIds = new Set(directStopRows.map((r) => r.stop_id));

  // Fetch parent_station and stop_name for every direct stop.
  const stopInfoRows = db
    .prepare(
      `
      SELECT stop_id, stop_name, COALESCE(parent_station, '') AS parent_station
      FROM stops
      WHERE stop_id IN (${[...directStopIds].map(() => "?").join(",")})
      `,
    )
    .all(...directStopIds) as {
    stop_id: string;
    stop_name: string;
    parent_station: string;
  }[];

  // Collect parent station IDs we also need to include.
  const parentIds = new Set<string>();
  for (const row of stopInfoRows) {
    if (row.parent_station) parentIds.add(row.parent_station);
  }

  // Fetch parent station info.
  const parentInfoRows =
    parentIds.size > 0
      ? (db
          .prepare(
            `
      SELECT stop_id, stop_name
      FROM stops
      WHERE stop_id IN (${[...parentIds].map(() => "?").join(",")})
      `,
          )
          .all(...parentIds) as { stop_id: string; stop_name: string }[])
      : [];

  const parentNameById = new Map(
    parentInfoRows.map((r) => [r.stop_id, r.stop_name]),
  );

  // Build the lookup structures.
  const stops: Record<string, { stopName: string; stationId: string }> = {};
  const children: Record<string, string[]> = {};

  // Add parent stations (stationId = themselves).
  for (const [parentId, parentName] of parentNameById) {
    stops[parentId] = { stopName: parentName, stationId: parentId };
  }

  // Add direct stops (child platforms or standalone stops).
  for (const row of stopInfoRows) {
    const stationId = row.parent_station || row.stop_id;
    const stopName = row.parent_station
      ? (parentNameById.get(row.parent_station) ?? row.stop_name)
      : row.stop_name;

    stops[row.stop_id] = { stopName, stationId };

    // Track parent → children relationships.
    if (row.parent_station) {
      if (!children[row.parent_station]) {
        children[row.parent_station] = [];
      }
      children[row.parent_station].push(row.stop_id);
    }
  }

  const lookup = { stops, children };

  const dir = dirname(STOP_LOOKUP_PATH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(STOP_LOOKUP_PATH, JSON.stringify(lookup, null, 2) + "\n");
  console.log(
    `Generated rail/busway stop lookup (${Object.keys(stops).length} stops) → ${STOP_LOOKUP_PATH}`,
  );
}

export default function importGTFS() {
  return {
    name: "data-import",
    hooks: {
      "astro:config:done": async () => {
        if (isDev && existsSync(DB_PATH)) {
          console.log(`Using existing GTFS database at ${DB_PATH}`);
        } else {
          console.log(
            `Importing GTFS to ${isDev ? "file-based" : "in-memory"} SQLite database...`,
          );
          await importGtfs(GTFSconfig);
        }
        generateStopLookup(GTFSconfig);
      },
    },
  };
}
