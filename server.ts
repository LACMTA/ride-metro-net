/**
 * Custom production server entry point.
 *
 * Starts the Astro app (middleware mode) alongside the GTFS realtime
 * cron poller — both running in the same Node.js process so they share
 * the same SQLite connection.
 *
 * Usage: tsx server.ts
 */
import http from "node:http";
import { handler as astroHandler } from "./dist/server/entry.mjs";
import { gtfsConfig } from "./src/integrations/import-gtfs.ts";
import { startRealtimePoller } from "./src/workers/gtfs-rt-poller.ts";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

startRealtimePoller(gtfsConfig);

const server = http.createServer((req, res) => {
  astroHandler(req, res, () => {
    // Fallback: Astro should handle all routes, but send 404 if it passes through.
    res.writeHead(404);
    res.end("Not found");
  });
});
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
