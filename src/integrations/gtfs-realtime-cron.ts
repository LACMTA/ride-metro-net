import type { AstroIntegration } from "astro";
import { startRealtimePoller } from "../workers/gtfs-rt-poller.ts";

export default function gtfsRealtimeCron(): AstroIntegration {
  return {
    name: "gtfs-realtime-cron",
    hooks: {
      "astro:server:start": () => {
        startRealtimePoller();
      },
    },
  };
}
