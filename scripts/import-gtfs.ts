import { importGtfs } from "gtfs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gtfsConfig, DB_PATH } from "../src/integrations/import-gtfs";

mkdirSync(dirname(resolve(DB_PATH)), { recursive: true });

const config = gtfsConfig;

console.log(`Importing GTFS data to ${DB_PATH}...`);
await importGtfs(config);
console.log("Done.");
