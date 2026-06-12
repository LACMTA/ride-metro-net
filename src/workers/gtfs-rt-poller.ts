import { updateGtfsRealtime } from "gtfs";
import cron from "node-cron";
import { gtfsConfig } from "../integrations/import-gtfs.js";

export function startRealtimePoller(): void {
  console.log("[gtfs-rt] Scheduling realtime poller (every minute)");
  cron.schedule("* * * * *", async () => {
    try {
      await updateGtfsRealtime(gtfsConfig);
      console.log("[gtfs-rt] Realtime data updated");
    } catch (err) {
      console.error("[gtfs-rt] Update failed:", err);
    }
  });
}
