import { test, expect } from "@playwright/test";

/**
 * Direct API endpoint tests — hit the endpoints without loading a page.
 * These verify the server-side API handlers independently of the UI.
 */
test.describe("API endpoints", () => {
  // ─── /api/predictions ───────────────────────────────────────────────────

  test.describe("GET /api/predictions", () => {
    test("returns predictions for a valid bus stop", async ({ request }) => {
      const res = await request.get("/api/predictions", {
        params: { stopId: "11010", agency: "lametro" },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);

      // If there are predictions, verify the shape
      if (body.length > 0) {
        const prediction = body[0];
        expect(prediction).toHaveProperty("routeId");
        expect(prediction).toHaveProperty("stopId");
        expect(prediction).toHaveProperty("destinations");
        expect(Array.isArray(prediction.destinations)).toBe(true);
      }
    });

    test("returns predictions for a rail child stop", async ({ request }) => {
      // 80214 is a child stop of Union Station (80214S)
      const res = await request.get("/api/predictions", {
        params: { stopId: "80214", agency: "lametro-rail" },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test("supports comma-separated stop IDs", async ({ request }) => {
      const res = await request.get("/api/predictions", {
        params: { stopId: "80214,80409", agency: "lametro-rail" },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test("returns 400 when stopId is missing", async ({ request }) => {
      const res = await request.get("/api/predictions", {
        params: { agency: "lametro" },
      });

      expect(res.status()).toBe(400);
    });

    test("returns 400 when agency is missing", async ({ request }) => {
      const res = await request.get("/api/predictions", {
        params: { stopId: "11010" },
      });

      expect(res.status()).toBe(400);
    });
  });

  // ─── /api/alerts ────────────────────────────────────────────────────────

  test.describe("GET /api/alerts", () => {
    test("returns alerts for a valid stop + route (bus)", async ({
      request,
    }) => {
      const res = await request.get("/api/alerts", {
        params: {
          stopId: "11010",
          routeId: "222",
          agency: "lametro",
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);

      // If there are alerts, verify the shape
      if (body.length > 0) {
        const alert = body[0];
        expect(alert).toHaveProperty("headerText");
        expect(alert).toHaveProperty("descriptionText");
        expect(alert).toHaveProperty("informedEntities");
        expect(Array.isArray(alert.informedEntities)).toBe(true);
      }
    });

    test("returns alerts for rail agency", async ({ request }) => {
      const res = await request.get("/api/alerts", {
        params: {
          stopId: "80214S",
          routeId: "801",
          agency: "lametro-rail",
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test("returns empty array when no filters match", async ({ request }) => {
      const res = await request.get("/api/alerts", {
        params: {
          stopId: "NONEXISTENT",
          agency: "lametro",
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      // Unlikely any alerts match a nonexistent stop
      expect(body.length).toBe(0);
    });

    test("returns 400 when agency is missing", async ({ request }) => {
      const res = await request.get("/api/alerts", {
        params: { stopId: "11010" },
      });

      expect(res.status()).toBe(400);
    });
  });
});
