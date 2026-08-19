import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry once — external Swiftly API can be flaky */
  retries: 1,
  /* Limit parallel workers so we don't overwhelm the server */
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    /* Collect trace on first retry for debugging */
    trace: "on-first-retry",
  },
  /* Start the standalone node server (build is run via the test script) */
  webServer: {
    command: "PORT=4321 npm run start",
    /* Use a route page for the health check — the index page returns 404 by design */
    url: "http://localhost:4321/lines/a",
    /* Server startup can be slow on first run */
    timeout: 120_000,
  },
});
