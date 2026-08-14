import type { AstroIntegration } from "astro";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

let poller: ReturnType<typeof spawn> | null = null;

export default function gtfsRealtimeCron(): AstroIntegration {
  return {
    name: "gtfs-realtime-cron",
    hooks: {
      "astro:server:start": () => {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const pollerPath = resolve(__dirname, "../workers/gtfs-rt-poller.ts");

        // Spawn the poller as a separate process so synchronous SQLite writes
        // don't block the dev server's event loop.
        poller = spawn("npx", ["tsx", pollerPath], {
          stdio: "inherit",
          env: process.env,
        });

        poller.on("exit", (code) => {
          if (code !== null && code !== 0) {
            console.error(`[gtfs-rt] Poller process exited with code ${code}`);
          }
        });

        // Clean up the poller when the dev server exits.
        process.on("exit", () => poller?.kill());
      },
      "astro:server:done": () => {
        poller?.kill();
      },
    },
  };
}
