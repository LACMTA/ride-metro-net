import { importGtfs, type Config } from "gtfs";
import { existsSync } from "node:fs";

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

export default function importGTFS() {
  return {
    name: "data-import",
    hooks: {
      "astro:config:done": async () => {
        if (isDev && existsSync(DB_PATH)) {
          console.log(`Using existing GTFS database at ${DB_PATH}`);
          return;
        }
        console.log(
          `Importing GTFS to ${isDev ? "file-based" : "in-memory"} SQLite database...`,
        );
        await importGtfs(GTFSconfig);
      },
    },
  };
}
