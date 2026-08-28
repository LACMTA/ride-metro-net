import type { BusStop } from "./getBusStopsForBbox";

/**
 * A shared, in-memory cache of prerendered bus-stop tiles.
 *
 * Both the system map (`SystemMap.astro`) and the sidebar
 * (`SystemMapSidebar.tsx`) fetch bus-stop tiles from the prerendered
 * `/api/bus-stops/[tile].json` endpoint. This module centralizes that
 * fetching so:
 *
 * - A tile is requested at most once (in-flight requests are deduped).
 * - A successfully-loaded tile (including an empty one) is cached for the
 *   lifetime of the page, so panning back — or a sidebar "nearby" search
 *   overlapping the current viewport — is a free cache hit with no network
 *   request and no DB load.
 *
 * This module is pure browser code: it has no server-side dependencies (no
 * `getGtfsDb`), so it can be safely imported from React components and
 * Astro `<script>` blocks alike.
 */

/** Cached tile results, keyed `"gridX,gridY"`. An empty array means the tile
 *  was fetched and legitimately has no stops (or is outside the service area). */
const tileCache = new Map<string, BusStop[]>();

/** In-flight tile fetches, deduped so concurrent callers share one request. */
const inFlight = new Map<string, Promise<BusStop[]>>();

/** Stops as returned by a tile JSON payload. */
interface TileJson {
  stops: BusStop[];
}

/**
 * Fetch a single bus-stop tile by its `"gridX,gridY"` key, caching the result.
 * Concurrent calls for the same key share a single network request.
 *
 * - A `404` (tile outside the prerendered service area) is treated as
 *   "no stops" and cached as `[]`, so it isn't re-requested.
 * - A network error is *not* cached, allowing a retry on the next call.
 *
 * @returns The tile's stops (cached or freshly fetched). Always resolves —
 *   network failures resolve to `[]` rather than rejecting, since bus stops
 *   are supplementary and callers prefer graceful degradation.
 */
export function fetchTile(tileKey: string): Promise<BusStop[]> {
  const cached = tileCache.get(tileKey);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(tileKey);
  if (pending) return pending;

  const request = (async (): Promise<BusStop[]> => {
    try {
      const res = await fetch(`/api/bus-stops/${tileKey}.json`);
      if (!res.ok) {
        // 404 (outside service area) or other non-ok: treat as empty and
        // cache so we don't retry. Empty tiles inside the service area
        // return 200 with `{ stops: [] }`, so a non-ok here is effectively
        // "no tile exists here".
        tileCache.set(tileKey, []);
        return [];
      }
      const json = (await res.json()) as TileJson;
      const stops = json.stops ?? [];
      tileCache.set(tileKey, stops);
      return stops;
    } catch {
      // Network error: don't cache — allow a later retry.
      return [];
    } finally {
      inFlight.delete(tileKey);
    }
  })();

  inFlight.set(tileKey, request);
  return request;
}

/**
 * Ensure a set of tiles are loaded, returning the flattened, stop-id-deduped
 * list of stops across all of them.
 */
export async function ensureTilesLoaded(
  tileKeys: string[],
): Promise<BusStop[]> {
  const results = await Promise.all(tileKeys.map((key) => fetchTile(key)));

  const seen = new Set<string>();
  const stops: BusStop[] = [];
  for (const tileStops of results) {
    for (const stop of tileStops) {
      if (seen.has(stop.stopId)) continue;
      seen.add(stop.stopId);
      stops.push(stop);
    }
  }
  return stops;
}

/** Synchronous read of a cached tile's stops, or `undefined` if not loaded. */
export function getTileStops(tileKey: string): BusStop[] | undefined {
  return tileCache.get(tileKey);
}

/** Whether a tile has been fetched and cached (including as `[]`). */
export function hasTile(tileKey: string): boolean {
  return tileCache.has(tileKey);
}
