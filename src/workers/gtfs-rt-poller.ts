import type { Config } from "gtfs";
import { updateGtfsRealtime } from "gtfs";
import cron from "node-cron";

export function startRealtimePoller(config: Config): void {
  console.log("[gtfs-rt] Scheduling realtime poller (every minute)");
  cron.schedule("* * * * *", async () => {
    try {
      await updateGtfsRealtime(config);
      console.log("[gtfs-rt] Realtime data updated");
    } catch (err) {
      console.error("[gtfs-rt] Update failed:", err);
    }
  });
}
