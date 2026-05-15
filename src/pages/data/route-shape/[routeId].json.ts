import type { APIContext } from "astro";
import getLineRouteSlugs from "../../../lib/getLineRouteSlugs";
import getRouteShapes from "../../../lib/getRouteShapes";

export const prerender = true;

export async function getStaticPaths() {
  return getLineRouteSlugs();
}

/**
 * GET /data/lines/<routeId>.json
 *
 * Returns the GTFS shape geometry for the line as a GeoJSON
 * `FeatureCollection` of `LineString`s, one feature per `shape_id` used by
 * trips of the route. Generated at build time alongside `/lines/<routeId>`.
 */
export async function GET({ props }: APIContext) {
  const { numericId } = props as { numericId: string };
  const geojson = getRouteShapes(numericId);

  return new Response(JSON.stringify(geojson), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
