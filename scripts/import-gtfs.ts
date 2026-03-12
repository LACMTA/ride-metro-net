import { importGtfs } from "gtfs";
import { buildGtfsConfig, DB_PATH } from "../src/integrations/import-gtfs";

const config = buildGtfsConfig(DB_PATH);

console.log(`Importing GTFS data to ${DB_PATH}...`);
await importGtfs(config);
console.log("Done.");
