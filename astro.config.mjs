// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import importGTFS from "./src/integrations/import-gtfs";

import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: "cloudflare",
  }),
  build: {
    // Our latency is mostly from SQLite,
    // which in-memory is only really hurt by higher concurrency.
    concurrency: 1,
  },
  vite: {
    // force GTFS/SQLite integration to run only at buildtime
    ssr: {
      external: ["gtfs", "better-sqlite3", "sqlite3"],
    },
  },
  integrations: [importGTFS(), preact()],
});
