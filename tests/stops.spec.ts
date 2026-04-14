import { test, expect } from "@playwright/test";
import { stops } from "./fixtures";

test.describe("Stop pages (/stops/:stopId)", () => {
  for (const stop of stops) {
    test(`loads /stops/${stop.stopId} (${stop.expectedName})`, async ({
      page,
    }) => {
      // Track API requests the page makes on load
      const predictionsRequests: string[] = [];
      const alertsRequests: string[] = [];

      page.on("request", (req) => {
        const url = req.url();
        if (url.includes("/api/predictions")) predictionsRequests.push(url);
        if (url.includes("/api/alerts")) alertsRequests.push(url);
      });

      const response = await page.goto(`/stops/${stop.stopId}`);

      // Page should return 200
      expect(response?.status()).toBe(200);

      // Heading should contain the stop name
      const heading = page.locator("h1");
      await expect(heading).toContainText(stop.expectedName);

      // Stop ID should be displayed
      await expect(page.getByText("STOP ID:")).toBeVisible();
      await expect(
        page.getByText(stop.stopId, { exact: false }),
      ).toBeVisible();

      // Wait for the client-side scripts to fire API requests.
      // The page calls watchPredictions and watchAlerts on load.
      await page.waitForTimeout(3000);

      // Verify predictions API was called
      expect(predictionsRequests.length).toBeGreaterThanOrEqual(1);
      const predictionsUrl = new URL(predictionsRequests[0]);
      expect(predictionsUrl.searchParams.get("agency")).toBe(stop.agency);
      expect(predictionsUrl.searchParams.get("stopId")).toBeTruthy();

      // Verify alerts API was called
      expect(alertsRequests.length).toBeGreaterThanOrEqual(1);
      const alertsUrl = new URL(alertsRequests[0]);
      expect(alertsUrl.searchParams.get("agency")).toBe(stop.agency);
      // Alerts should include the stop ID
      const alertStopIds =
        alertsUrl.searchParams.get("stopId")?.split(",") ?? [];
      expect(alertStopIds).toContain(stop.stopId);
    });

    test(`/stops/${stop.stopId} predictions API returns valid JSON`, async ({
      page,
    }) => {
      // Intercept the predictions request and verify the response
      const predictionsResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes("/api/predictions"),
        { timeout: 30_000 },
      );

      await page.goto(`/stops/${stop.stopId}`);

      const predictionsResponse = await predictionsResponsePromise;
      expect(predictionsResponse.status()).toBe(200);

      const body = await predictionsResponse.json();
      // Should be an array (possibly empty if no active predictions)
      expect(Array.isArray(body)).toBe(true);
    });

    test(`/stops/${stop.stopId} alerts API returns valid JSON`, async ({
      page,
    }) => {
      // Intercept the alerts request and verify the response
      const alertsResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes("/api/alerts"),
        { timeout: 30_000 },
      );

      await page.goto(`/stops/${stop.stopId}`);

      const alertsResponse = await alertsResponsePromise;
      expect(alertsResponse.status()).toBe(200);

      const body = await alertsResponse.json();
      // Should be an array (possibly empty if no active alerts)
      expect(Array.isArray(body)).toBe(true);
    });
  }
});
