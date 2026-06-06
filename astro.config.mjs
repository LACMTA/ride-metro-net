// @ts-check
import { defineConfig, envField } from "astro/config";
import importGTFS from "./src/integrations/import-gtfs";
import gtfsRealtimeCron from "./src/integrations/gtfs-realtime-cron";
import react from "@astrojs/react";
import node from "@astrojs/node";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  build: {
    // Our latency is mostly from SQLite,
    // which in-memory is only really hurt by higher concurrency.
    concurrency: 1,
  },
  env: {
    schema: {
      API_KEY: envField.string({
        context: "server",
        access: "secret",
      }),
    },
  },
  vite: {
    // force GTFS/SQLite integration to run only at buildtime
    ssr: {
      external: ["gtfs", "better-sqlite3", "sqlite3"],
    },

    plugins: [tailwindcss()],
  },
  integrations: [importGTFS(), gtfsRealtimeCron(), react()],
  adapter: node({ mode: "standalone" }),
});
