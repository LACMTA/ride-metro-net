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

      // Heading should match the route's full title.
      // Rail and busway routes render as "Metro X Line";
      // regular bus routes render as "Line X Bus".
      const heading = page.locator("h1");
      await expect(heading).toContainText(route.expectedTitle);

      // Verify correct badge type renders
      if (route.routeType === 3) {
        // Bus and busway routes show a RouteBadge span with the short name
        const badge = page.locator("span", {
          hasText: route.expectedShortName,
        });
        await expect(badge.first()).toBeVisible();
      } else {
        // Rail routes show a RouteBadge containing the letter name
        await expect(
          page.getByText(route.expectedShortName).first(),
        ).toBeVisible();
      }
    });
  }
});
