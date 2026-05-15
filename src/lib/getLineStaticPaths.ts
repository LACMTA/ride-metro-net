import { openDb } from "gtfs";
import { GTFSconfig } from "../integrations/import-gtfs";
import { ROUTE_SHORT_NAME_OVERRIDES } from "./routeShortNameOverrides";

/**
 * Shared `getStaticPaths` logic for line pages (`/lines/[routeId]/*`).
 *
 * Builds a path entry for every active route (those that have trips),
 * deduplicating by the stable numeric prefix of `route_id` (e.g. "901-13196" → "901").
 * Routes with a letter override (e.g. 801 → "A") are served at the letter slug.
 */
export async function getLineStaticPaths() {
  const db = openDb(GTFSconfig);
  // Build pages for all routes that have trips (are active in the schedule).
  // Strip the version suffix from route_id (e.g. "901-13196" → "901") so that
  // page URLs are stable across GTFS releases, then deduplicate.
  const allRoutes = (await db
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
    .all()) as { route_id: string }[];

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
