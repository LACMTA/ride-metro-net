import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import { ROUTE_SHORT_NAME_OVERRIDES } from "./routeShortNameOverrides";

export interface LineRouteSlug {
  params: { routeId: string };
  props: { numericId: string };
}

/**
 * Build the list of `getStaticPaths()` entries for every Metro line page.
 *
 * Pulls all routes that have trips (i.e. are active in the schedule), strips
 * the version suffix from `route_id` (e.g. `"901-13196"` → `"901"`) so URLs
 * stay stable across GTFS releases, then deduplicates by numeric prefix.
 *
 * Lettered routes (A–K) are served at e.g. `/lines/a`; the numeric prefix is
 * preserved on `props.numericId` so callers can use it for DB lookups.
 *
 * Shared between `src/pages/lines/[routeId].astro` and
 * `src/pages/data/lines/[routeId].json.ts` so the two endpoints stay in sync.
 */
export default function getLineRouteSlugs(): LineRouteSlug[] {
  const db = openDb(GTFSconfig);

  const allRoutes = db
    .prepare(
      `
      SELECT DISTINCT r.route_id
      FROM routes r
      JOIN trips t ON t.route_id = r.route_id
      -- long name is only null on stadium expresses, which we don't build for now
      WHERE r.route_long_name IS NOT NULL AND r.route_long_name != ''
      ORDER BY r.route_id
      `,
    )
    .all() as { route_id: string }[];

  const uniquePrefixes = [
    ...new Set(allRoutes.map((route) => route.route_id.split("-")[0])),
  ];

  return uniquePrefixes.map((numericPrefix) => {
    const letter = ROUTE_SHORT_NAME_OVERRIDES[numericPrefix];
    // Routes with a letter override are served at e.g. /lines/a instead of /lines/801
    const slug = letter ? letter.toLowerCase() : numericPrefix;
    return {
      params: { routeId: slug },
      props: { numericId: numericPrefix },
    };
  });
}
