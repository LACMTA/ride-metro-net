import { importGtfs } from "gtfs";
import { gtfsConfig, DB_PATH } from "../src/integrations/import-gtfs";

const config = gtfsConfig;

console.log(`Importing GTFS data to ${DB_PATH}...`);
await importGtfs(config);
console.log("Done.");
