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
    concurrency: 1,
  },
  env: {
    schema: {
      API_KEY: envField.string({
        context: "server",
        access: "secret",
      }),
      ESRI_KEY: envField.string({
        context: "client",
        access: "public",
      }),
    },
  },
  vite: {
    ssr: {
      external: ["gtfs", "better-sqlite3", "sqlite3"],
    },
    plugins: [tailwindcss()],
  },
  integrations: [importGTFS(), gtfsRealtimeCron(), react()],
  adapter: node({ mode: "standalone" }),
});
