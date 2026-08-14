import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pollerPath = resolve(__dirname, "src/workers/gtfs-rt-poller.ts");

// Spawn the GTFS-rt poller as a separate process so synchronous SQLite writes
// don't block the web server's event loop.
const poller = spawn("npx", ["tsx", pollerPath], {
  stdio: "inherit",
  env: process.env,
});

poller.on("exit", (code) => {
  if (code !== null && code !== 0) {
    console.error(`[gtfs-rt] Poller process exited with code ${code}`);
  }
});

// Clean up the poller when the server exits.
process.on("exit", () => poller.kill());
process.on("SIGINT", () => {
  poller.kill();
  process.exit(0);
});
process.on("SIGTERM", () => {
  poller.kill();
  process.exit(0);
});

import "./dist/server/entry.mjs";
