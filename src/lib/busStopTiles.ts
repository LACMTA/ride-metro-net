/**
 * Shared tile-snapping math for bus-stop grid tiles.
 *
 * This module is pure math with no server-side dependencies (no SQLite, no
 * `getGtfsDb`), so it can be safely imported from both the browser (via the
 * Astro `<script>` in `SystemMap.astro`) and the server (build-time
 * prerendering in `getBusStopsForBbox.ts` and `[tile].json.ts`).
 *
 * Both front and backend must agree on how coordinates are assigned to tiles.
 * Centralizing the logic here prevents the class of bug where one side uses
 * `Math.round` and the other uses `Math.floor` — or vice versa — and tiles
 * silently don't match.
 */

/**
 * Grid size (in degrees) for snapping bus-stop bounding-box queries. The
 * client rounds viewport bounds to this grid so the same geographic area
 * always produces the same URL, enabling HTTP cache hits.
 * 0.02° ≈ 2.2 km at LA's latitude — large enough that most tiles in the
 * service area contain at least one bus stop, minimizing empty-tile 404s,
 * while keeping each tile's JSON payload small (typically < 30 KB even
 * in dense areas like DTLA).
 */
export const BUS_STOP_GRID_SIZE = 0.02;

/** Number of grid tiles to prefetch beyond the viewport in each direction. */
export const BUS_STOP_PREFETCH_TILES = 1;

/**
 * Snap a coordinate down to the grid cell boundary (floor-based).
 * Used by the client to determine which tile a viewport edge falls in.
 */
export function snapToGrid(value: number): number {
  return Math.floor(value / BUS_STOP_GRID_SIZE) * BUS_STOP_GRID_SIZE;
}

/**
 * Grid X index for a longitude. Uses `Math.floor` so a stop at lon=-118.2601
 * is assigned to gridX=-23653, matching the tile the client requests when
 * `snapToGrid` rounds the viewport down to the same boundary.
 */
export function gridXForLon(lon: number): number {
  return Math.floor(lon / BUS_STOP_GRID_SIZE);
}

/**
 * Grid Y index for a latitude. See {@link gridXForLon}.
 */
export function gridYForLat(lat: number): number {
  return Math.floor(lat / BUS_STOP_GRID_SIZE);
}

/**
 * Tile key string (`"gridX,gridY"`) for a lon/lat coordinate.
 * Used as the URL path segment in prerendered tile JSON files and the
 * `fetchedTiles` Set key in the client.
 */
export function tileKeyForLonLat(lon: number, lat: number): string {
  return `${gridXForLon(lon)},${gridYForLat(lat)}`;
}

/**
 * Reconstruct the bounding box for a grid tile from its X/Y indices.
 * The tile covers `[west, south]` to `[east, north]`.
 */
export function tileBbox(
  gridX: number,
  gridY: number,
): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const west = gridX * BUS_STOP_GRID_SIZE;
  const south = gridY * BUS_STOP_GRID_SIZE;
  return {
    west,
    south,
    east: west + BUS_STOP_GRID_SIZE,
    north: south + BUS_STOP_GRID_SIZE,
  };
}
