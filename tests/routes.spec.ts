import { test, expect } from "@playwright/test";
import { routes } from "./fixtures";

test.describe("Route pages (/lines/:slug)", () => {
  for (const route of routes) {
    test(`loads /lines/${route.slug} (${route.expectedShortName} Line)`, async ({
      page,
    }) => {
      const response = await page.goto(`/lines/${route.slug}`);

      // Page should return 200
      expect(response?.status()).toBe(200);

      // Heading should contain the route short name
      const heading = page.locator("h1");
      await expect(heading).toContainText(
        `Line ${route.expectedShortName}`,
      );

      // Route ID should be displayed in the "ROUTE ID: <b>xxx</b>" block
      const routeIdBlock = page.locator("small", {
        hasText: "ROUTE ID:",
      });
      await expect(routeIdBlock).toBeVisible();
      await expect(routeIdBlock).toContainText(route.numericId);

      // Verify correct icon type renders
      if (route.routeType === 3) {
        // Bus routes should show a BusPill (a styled span with the short name)
        const busPill = page.locator("span", {
          hasText: route.expectedShortName,
        });
        await expect(busPill.first()).toBeVisible();
      } else {
        // Rail routes should show a RailIcon containing the letter name
        await expect(
          page.getByText(route.expectedShortName).first(),
        ).toBeVisible();
      }
    });
  }
});
