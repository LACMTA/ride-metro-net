export const prerender = true;

import {
  getBusStopsForBbox,
  getAllBusStopTileKeysInServiceArea,
} from "../../../lib/getBusStopsForBbox";
import { tileBbox } from "../../../lib/busStopTiles";
import { prodCacheHeader } from "../../../lib/prodCacheHeader";

/**
 * Prerendered bus-stop tile endpoint.
 *
 * At build time, `getStaticPaths` enumerates every grid tile within the bus
 * service area bounding box (including empty tiles) and generates a static
 * JSON file for each. Empty tiles return `{"stops":[]}` — no 404s for any
 * tile within the service area. The client skips fetches entirely for tiles
 * outside the service area bbox (e.g. ocean, other counties).
 *
 * Tile param format: `"gridX,gridY"` where `gridX = floor(lon / 0.02)`
 * and `gridY = floor(lat / 0.02)`.
 *
 * @returns {{ stops: BusStop[] }}
 */
export async function getStaticPaths() {
  const tileKeys = getAllBusStopTileKeysInServiceArea();

  return tileKeys.map((tileKey) => ({
    params: { tile: tileKey },
  }));
}

export async function GET(context: import("astro").APIContext) {
  const tileParam = context.params.tile;
  if (!tileParam) {
    return new Response("tile parameter is required", { status: 400 });
  }

  const parts = tileParam.split(",");
  if (parts.length !== 2) {
    return new Response("tile must be 'gridX,gridY'", { status: 400 });
  }

  const gridX = Number.parseInt(parts[0], 10);
  const gridY = Number.parseInt(parts[1], 10);
  if (Number.isNaN(gridX) || Number.isNaN(gridY)) {
    return new Response("tile coordinates must be integers", { status: 400 });
  }

  // Reconstruct the bbox from the grid coordinates.
  const { west, south, east, north } = tileBbox(gridX, gridY);

  const stops = getBusStopsForBbox(west, south, east, north);

  return new Response(JSON.stringify({ stops }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": prodCacheHeader(),
    },
  });
}
