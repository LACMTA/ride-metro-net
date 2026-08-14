import { updateGtfsRealtime } from "gtfs";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { gtfsConfig } from "../lib/gtfsConfig";

export function startRealtimePoller(): void {
  console.log("[gtfs-rt] Scheduling realtime poller (every minute)");

  // Prevent overlapping cron ticks if an update takes longer than 1 minute.
  // Without this, concurrent updateGtfsRealtime calls compete for SQLite's
  // single writer lock, causing cascading delays.
  let isUpdating = false;

  cron.schedule("* * * * *", async () => {
    if (isUpdating) {
      console.log(
        "[gtfs-rt] Previous update still running, skipping this tick",
      );
      return;
    }

    isUpdating = true;
    try {
      const start = Date.now();
      await updateGtfsRealtime(gtfsConfig);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[gtfs-rt] Realtime data updated (${elapsed}s)`);
    } catch (err) {
      console.error("[gtfs-rt] Update failed:", err);
    } finally {
      isUpdating = false;
    }
  });
}

// When run directly as a script (`npx tsx src/workers/gtfs-rt-poller.ts`),
// start the poller immediately. This allows the poller to run as a separate
// process so synchronous SQLite writes don't block the web server.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  startRealtimePoller();
}
