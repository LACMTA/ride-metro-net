/**
 * Fixed subset of routes and stops used by all test specs.
 *
 * We intentionally keep this small and deterministic — a curated set that
 * covers every major code-path (rail vs bus, letter slug vs numeric slug,
 * parent station vs regular stop) without testing thousands of pages.
 */

// ─── Route fixtures ─────────────────────────────────────────────────────────

export interface RouteFixture {
  /** URL slug used in /lines/:slug */
  slug: string;
  /** Expected route_short_name displayed on the page */
  expectedShortName: string;
  /** Stable numeric prefix of route_id */
  numericId: string;
  /** 0 = light-rail, 1 = subway, 3 = bus */
  routeType: number;
}

export const routes: RouteFixture[] = [
  // Rail lines — use letter slugs via ROUTE_SHORT_NAME_OVERRIDES
  { slug: "a", expectedShortName: "A", numericId: "801", routeType: 0 },
  { slug: "b", expectedShortName: "B", numericId: "802", routeType: 1 },
  // Rapid bus — uses letter slug
  { slug: "g", expectedShortName: "G", numericId: "901", routeType: 3 },
  // Regular bus — numeric slug
  { slug: "720", expectedShortName: "720", numericId: "720", routeType: 3 },
  { slug: "10", expectedShortName: "10/48", numericId: "10", routeType: 3 },
];

// ─── Stop fixtures ──────────────────────────────────────────────────────────

export interface StopFixture {
  stopId: string;
  expectedName: string;
  /** Whether this stop is a parent station (has child stops in GTFS) */
  isParentStation: boolean;
  /** Swiftly agency key expected for prediction/alert requests */
  agency: string;
}

export const stops: StopFixture[] = [
  // Parent station — major rail hub with multiple child stops
  {
    stopId: "80214S",
    expectedName: "Union Station",
    isParentStation: true,
    agency: "lametro-rail",
  },
  // Parent station — serves A, B, D, E lines
  {
    stopId: "80122S",
    expectedName: "7th Street / Metro Center Station",
    isParentStation: true,
    agency: "lametro-rail",
  },
  // Regular bus stop
  {
    stopId: "11010",
    expectedName: "Hollywood / Vine Station",
    isParentStation: false,
    agency: "lametro",
  },
  // Regular bus stop — low-number ID
  {
    stopId: "1104",
    expectedName: "103rd / Avalon",
    isParentStation: false,
    agency: "lametro",
  },
];
