import { importGtfs } from "gtfs";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gtfsConfig, DB_PATH } from "../lib/gtfsConfig";

const isDev = process.argv.includes("dev");

export default function importGTFS() {
  return {
    name: "data-import",
    hooks: {
      "astro:config:done": async () => {
        if (isDev && existsSync(DB_PATH)) {
          console.log(`Using existing GTFS database at ${DB_PATH}`);
        } else {
          // always rebuild the database in prod
          console.log(`Importing GTFS to SQLite database...`);
          mkdirSync(dirname(resolve(DB_PATH)), { recursive: true });
          await importGtfs(gtfsConfig);
        }
      },
    },
  };
}
