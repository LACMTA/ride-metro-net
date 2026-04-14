import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry once — external Swiftly API can be flaky */
  retries: 1,
  /* Limit parallel workers so we don't overwhelm the dev server */
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    /* Collect trace on first retry for debugging */
    trace: "on-first-retry",
  },
  /* Start the Astro dev server before tests run */
  webServer: {
    command: "npm run dev",
    /* Use a route page for the health check — the index page returns 404 by design */
    url: "http://localhost:4321/lines/a",
    /* The GTFS import + Vite startup can be slow on first page render */
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
