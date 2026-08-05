/**
 * Lightweight offset computation for the system map.
 *
 * Takes the raw GTFS shape polyline + ordered stops for each route and
 * produces render-ready line segments with side-by-side offset slots so
 * co-running lines render next to each other instead of occluding.
 *
 * This is a stripped-down replacement for the old `processSystemShapes`:
 * no stop pinning, no Douglas–Peucker simplification, no Chaikin smoothing.
 * MapLibre handles simplification and corner rounding at render time.
 *
 * Steps:
 * 1. Split each route at station boundaries (nearest shape point to each
 *    station's coordinate — no projection math, just squared distance).
 * 2. Key each inter-station span by the (unordered) station pair so routes
 *    sharing a span are grouped together.
 * 3. Assign symmetric offset slots per corridor (sorted by route ID).
 * 4. Merge consecutive segments with the same offset to keep payloads small.
 */

/** `[longitude, latitude]` pair in GeoJSON order. */
type Coord = [number, number];

export interface SystemShapeStopInput {
  parentStationId: string;
  lat: number;
  lon: number;
}

export interface SystemShapeInput {
  routeId: string;
  /** Raw shape coordinates in `[lon, lat]` GeoJSON order. */
  coordinates: Coord[];
  /** Stops in travel order along the shape. */
  stops: SystemShapeStopInput[];
}

export interface RenderSegment {
  /** Coordinates in `[lon, lat]` GeoJSON order. */
  coordinates: Coord[];
  /**
   * Integer side-by-side slot relative to the line's direction of travel.
   * `0` means "draw on the centerline"; co-running routes get symmetric
   * slots (e.g. `-1` / `+1` for two routes, `-2` / `0` / `+2` for three).
   * The client multiplies this by a pixel spacing constant.
   */
  offset: number;
}

/** Squared Euclidean distance — sufficient for nearest-point matching. */
function dist2(a: Coord, lon: number, lat: number): number {
  return (a[0] - lon) ** 2 + (a[1] - lat) ** 2;
}

/**
 * Finds the index of the coordinate nearest to `[lon, lat]`, scanning
 * forward from `startAt` so stations stay in travel order.
 */
function nearestIndexForward(
  coords: Coord[],
  lon: number,
  lat: number,
  startAt: number,
): number {
  let bestIdx = Math.min(startAt, coords.length - 1);
  let bestDist = Infinity;
  for (let i = bestIdx; i < coords.length; i++) {
    const d = dist2(coords[i], lon, lat);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Corridor {
  /** Station ID at the start of the canonical direction. */
  fromStation: string;
  /** Route IDs that traverse this corridor (may contain duplicates). */
  routeIds: string[];
  /** Assigned offset slot per route. */
  slotByRoute?: Map<string, number>;
}

interface SpanRef {
  corridorKey: string;
  /** Whether this route traverses the corridor opposite to the canonical direction. */
  reversed: boolean;
}

/**
 * Computes render segments with offset slots for all routes.
 *
 * @param inputs One per route — raw shape coordinates + ordered stops.
 * @returns Map from routeId to list of {@link RenderSegment}s.
 */
export function computeLineOffsets(
  inputs: SystemShapeInput[],
): Map<string, RenderSegment[]> {
  // -------------------------------------------------------------------------
  // Phase 1: deduplicate station coordinates by parentStationId (first-seen
  // wins). This is just a Map — no geometry projection.
  // -------------------------------------------------------------------------
  const stationCoord = new Map<string, Coord>();
  for (const input of inputs) {
    for (const stop of input.stops) {
      if (!stationCoord.has(stop.parentStationId)) {
        stationCoord.set(stop.parentStationId, [stop.lon, stop.lat]);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: per route — split at station boundaries, register each span
  // in the corridor registry.
  // -------------------------------------------------------------------------
  const corridors = new Map<string, Corridor>();
  const spanRefsByRoute = new Map<string, SpanRef[]>();
  // Store the split coordinates per route for Phase 4.
  const splitCoordsByRoute = new Map<string, Coord[][]>();

  for (const input of inputs) {
    const refs: SpanRef[] = [];
    spanRefsByRoute.set(input.routeId, refs);

    if (input.coordinates.length < 2) {
      splitCoordsByRoute.set(input.routeId, []);
      continue;
    }

    // Collapse consecutive stops that share a parent station.
    const stationIds: string[] = [];
    for (const stop of input.stops) {
      if (stationIds[stationIds.length - 1] !== stop.parentStationId) {
        stationIds.push(stop.parentStationId);
      }
    }

    // Routes without enough stations render as a single unshared span.
    if (stationIds.length < 2) {
      const key = `route:${input.routeId}`;
      corridors.set(key, {
        fromStation: "",
        routeIds: [input.routeId],
      });
      refs.push({ corridorKey: key, reversed: false });
      splitCoordsByRoute.set(input.routeId, [input.coordinates]);
      continue;
    }

    // Find the nearest shape point to each station (forward-only scan).
    const coords = input.coordinates;
    const splitIndices: number[] = [];
    let searchFrom = 0;
    for (const stationId of stationIds) {
      const sc = stationCoord.get(stationId)!;
      const idx = nearestIndexForward(coords, sc[0], sc[1], searchFrom);
      splitIndices.push(idx);
      searchFrom = idx;
    }

    // Build span coordinate slices between consecutive station indices,
    // skipping degenerate spans where start >= end (stations that matched
    // the same or an earlier shape point). The spans and refs arrays must
    // stay aligned, so we only push to both for valid spans.
    const spans: Coord[][] = [];
    const validK: number[] = [];
    for (let k = 0; k < splitIndices.length - 1; k++) {
      const start = splitIndices[k];
      const end = splitIndices[k + 1];
      if (start < end) {
        spans.push(coords.slice(start, end + 1));
        validK.push(k);
      }
    }
    splitCoordsByRoute.set(input.routeId, spans);

    // Register each valid span in the corridor registry.
    for (const k of validK) {
      const fromStation = stationIds[k];
      const toStation = stationIds[k + 1];
      const key = pairKey(fromStation, toStation);
      let corridor = corridors.get(key);
      if (!corridor) {
        corridor = { fromStation, routeIds: [] };
        corridors.set(key, corridor);
      }
      corridor.routeIds.push(input.routeId);

      // Reversed if this route traverses the corridor opposite to the
      // canonical direction (the direction of the first route that
      // registered this corridor).
      refs.push({
        corridorKey: key,
        reversed: fromStation !== corridor.fromStation,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: assign symmetric offset slots per corridor.
  // -------------------------------------------------------------------------
  for (const corridor of corridors.values()) {
    const uniqueRoutes = [...new Set(corridor.routeIds)].sort();
    const n = uniqueRoutes.length;
    corridor.slotByRoute = new Map(
      uniqueRoutes.map((routeId, i) => [routeId, 2 * i - (n - 1)]),
    );
  }

  // -------------------------------------------------------------------------
  // Phase 4: reassemble each route as render segments, merging consecutive
  // spans with the same offset.
  // -------------------------------------------------------------------------
  const segmentsByRoute = new Map<string, RenderSegment[]>();

  for (const input of inputs) {
    const segments: RenderSegment[] = [];
    segmentsByRoute.set(input.routeId, segments);

    const spans = splitCoordsByRoute.get(input.routeId) ?? [];
    const refs = spanRefsByRoute.get(input.routeId) ?? [];

    for (let i = 0; i < spans.length; i++) {
      const ref = refs[i];
      if (!ref) continue;
      const corridor = corridors.get(ref.corridorKey)!;
      const slot = corridor.slotByRoute?.get(input.routeId) ?? 0;
      const offset = ref.reversed ? -slot : slot;
      const spanCoords = spans[i];
      const coords = ref.reversed ? spanCoords.slice().reverse() : spanCoords;

      const prev = segments[segments.length - 1];
      if (prev && prev.offset === offset) {
        // Continue the previous segment (skip the duplicated joint vertex).
        for (let j = 1; j < coords.length; j++) {
          prev.coordinates.push(coords[j]);
        }
      } else {
        segments.push({ coordinates: coords.slice(), offset });
      }
    }
  }

  return segmentsByRoute;
}
