// @ts-check
import { defineConfig, envField } from "astro/config";
import importGTFS from "./src/integrations/import-gtfs";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";

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
    },
  },
  vite: {
    // force GTFS/SQLite integration to run only at buildtime
    ssr: {
      external: ["gtfs", "better-sqlite3", "sqlite3"],
    },

    plugins: [tailwindcss()],
  },
  integrations: [importGTFS(), react()],
  adapter: netlify(),
});
