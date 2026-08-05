/**
 * Build-time geometry processing for the system map.
 *
 * Takes the raw GTFS shape polyline + ordered stops for each route and
 * produces render-ready line segments:
 *
 * 1. **Station canonicalization** — each parent station gets one canonical
 *    coordinate shared by every route that serves it, so shared stations
 *    sit exactly on every line that passes through them.
 * 2. **Stop pinning** — each station's canonical coordinate is inserted as a
 *    vertex into the route polyline at its projected position, so the line
 *    passes exactly through the stop. Stop coordinates are never moved.
 * 3. **Corridor detection** — spans between consecutive stations are keyed by
 *    the (unordered) station pair. Routes sharing a span adopt one canonical
 *    geometry so overlaps are pixel-exact, and each route is assigned a
 *    side-by-side offset slot so co-running lines render next to each other
 *    instead of occluding one another.
 * 4. **Simplify** — each unique span geometry is simplified with
 *    Douglas–Peucker (dropping noisy GTFS shape points). Span endpoints
 *    are pinned stop coordinates and are never moved. Visual corner
 *    rounding is handled at render time by MapLibre's `line-join: "round"`.
 *
 * All of this runs at build time (the system map page is prerendered); the
 * client just draws the precomputed segments.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** `[longitude, latitude]` pair in GeoJSON order. */
type Coord = [number, number];

export interface SystemShapeStopInput {
  parentStationId: string;
  stopName: string;
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

/**
 * One drawable piece of a route's line. Consecutive spans with the same
 * offset slot are merged, so most routes produce only a handful of segments.
 */
export interface RenderSegment {
  /** Coordinates in `[lon, lat]` GeoJSON order. */
  coordinates: Coord[];
  /**
   * Integer side-by-side slot relative to the line's direction of travel.
   * `0` means "draw on the centerline"; co-running routes get symmetric
   * slots (e.g. `-1` / `+1` for two routes, `-2` / `0` / `+2` for three).
   * The client multiplies this by a pixel spacing constant so the visual
   * gap stays constant at every zoom level.
   */
  offset: number;
}

export interface ProcessedStation {
  stationId: string;
  stopName: string;
  lat: number;
  lon: number;
  /** Number of system-map routes serving this station. */
  lineCount: number;
}

export interface ProcessedSystemShapes {
  segmentsByRoute: Map<string, RenderSegment[]>;
  stations: ProcessedStation[];
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Approximate meters per degree of latitude. */
const METERS_PER_DEG = 111_320;

/** Longitude scale factor at LA's average latitude (~34.05° N). */
const COS_LAT = Math.cos((34.05 * Math.PI) / 180);

/**
 * Douglas–Peucker simplification tolerance, in degrees (~15 m). Large enough
 * to strip jittery GTFS shape points, small enough to preserve real curves.
 */
const SIMPLIFY_TOLERANCE_DEG = 15 / METERS_PER_DEG;

/**
 * If two routes connect the same station pair but their span geometries
 * differ in length by more than this ratio, they are assumed to take
 * different physical paths and are NOT merged into a shared corridor.
 */
const CORRIDOR_LENGTH_RATIO_LIMIT = 1.5;

// ---------------------------------------------------------------------------
// Planar geometry helpers (equirectangular approximation, fine at LA scale)
// ---------------------------------------------------------------------------

interface Projection {
  /** Parametric position along the segment, clamped to [0, 1]. */
  t: number;
  /** Squared distance from the point to its projection, in scaled degrees. */
  d2: number;
}

/** Projects point `p` onto segment `[a, b]` in locally-scaled lon/lat space. */
function projectOnSegment(p: Coord, a: Coord, b: Coord): Projection {
  const abx = (b[0] - a[0]) * COS_LAT;
  const aby = b[1] - a[1];
  const apx = (p[0] - a[0]) * COS_LAT;
  const apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  return { t, d2: dx * dx + dy * dy };
}

/** Approximate path length in scaled degrees. */
function pathLength(coords: Coord[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = (coords[i + 1][0] - coords[i][0]) * COS_LAT;
    const dy = coords[i + 1][1] - coords[i][1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Stop pinning
// ---------------------------------------------------------------------------

/**
 * Inserts each stop's exact coordinate as a vertex in the polyline at its
 * projected position, scanning monotonically forward so stops stay in travel
 * order. Returns the augmented polyline and the vertex index of each stop.
 *
 * The line is warped *toward* the stop (the stop coordinate itself becomes a
 * vertex) — stop coordinates are never moved.
 */
function pinStops(
  coords: Coord[],
  stopCoords: Coord[],
): { pinned: Coord[]; stopIndices: number[] } {
  const pinned = coords.slice();
  const stopIndices: number[] = [];
  let searchFrom = 0;

  for (const stop of stopCoords) {
    let bestI = Math.min(searchFrom, pinned.length - 2);
    let bestD = Infinity;
    for (let i = bestI; i <= pinned.length - 2; i++) {
      const { d2 } = projectOnSegment(stop, pinned[i], pinned[i + 1]);
      if (d2 < bestD) {
        bestD = d2;
        bestI = i;
      }
    }
    const insertAt = bestI + 1;
    pinned.splice(insertAt, 0, stop);
    stopIndices.push(insertAt);
    searchFrom = insertAt;
  }

  return { pinned, stopIndices };
}

// ---------------------------------------------------------------------------
// Simplification
// ---------------------------------------------------------------------------

/**
 * Iterative Douglas–Peucker simplification. Endpoints are always kept, so
 * pinned stop coordinates at span boundaries are never moved.
 */
function simplify(coords: Coord[], toleranceDeg: number): Coord[] {
  if (coords.length <= 2) return coords;
  const keep = new Array<boolean>(coords.length).fill(false);
  keep[0] = true;
  keep[coords.length - 1] = true;
  const tol2 = toleranceDeg * toleranceDeg;
  const stack: [number, number][] = [[0, coords.length - 1]];

  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let maxD = tol2;
    let maxI = -1;
    for (let i = s + 1; i < e; i++) {
      const { d2 } = projectOnSegment(coords[i], coords[s], coords[e]);
      if (d2 > maxD) {
        maxD = d2;
        maxI = i;
      }
    }
    if (maxI !== -1) {
      keep[maxI] = true;
      stack.push([s, maxI], [maxI, e]);
    }
  }

  return coords.filter((_, i) => keep[i]);
}

/** Rounds a coordinate to 6 decimal places (~0.11 m) to keep payloads small. */
function roundCoord(c: Coord): Coord {
  return [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
}

// ---------------------------------------------------------------------------
// Corridor detection
// ---------------------------------------------------------------------------

interface Corridor {
  /** Canonical geometry (pinned, simplified), in canonical direction. */
  coords: Coord[];
  /** Station ID at the start of the canonical direction. */
  fromStation: string;
  /** Route IDs that traverse this corridor (may contain duplicates). */
  routeIds: string[];
  /** Assigned offset slot per route, in canonical direction. */
  slotByRoute?: Map<string, number>;
}

/** Reference from one route-span to its (possibly shared) corridor. */
interface SpanRef {
  corridorKey: string;
  /** Whether this route traverses the corridor opposite to canonical. */
  reversed: boolean;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function processSystemShapes(
  inputs: SystemShapeInput[],
): ProcessedSystemShapes {
  // -------------------------------------------------------------------------
  // Phase 1: canonical station coordinates + line counts.
  // First-seen coordinates win, so every route pins the *same* point for a
  // shared station and corridor geometries join seamlessly.
  // -------------------------------------------------------------------------
  const stationById = new Map<
    string,
    { stopName: string; coord: Coord; routes: Set<string> }
  >();

  for (const input of inputs) {
    for (const stop of input.stops) {
      let station = stationById.get(stop.parentStationId);
      if (!station) {
        station = {
          stopName: stop.stopName,
          coord: [stop.lon, stop.lat],
          routes: new Set(),
        };
        stationById.set(stop.parentStationId, station);
      }
      station.routes.add(input.routeId);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: per route — pin stations into the polyline, trim to terminal
  // stations, split into inter-station spans, and register each span in the
  // corridor registry.
  // -------------------------------------------------------------------------
  const corridors = new Map<string, Corridor>();
  const spanRefsByRoute = new Map<string, SpanRef[]>();

  for (const input of inputs) {
    const refs: SpanRef[] = [];
    spanRefsByRoute.set(input.routeId, refs);

    if (input.coordinates.length < 2) continue;

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
        coords: input.coordinates,
        fromStation: "",
        routeIds: [input.routeId],
      });
      refs.push({ corridorKey: key, reversed: false });
      continue;
    }

    const stopCoords = stationIds.map((id) => stationById.get(id)!.coord);
    const { pinned, stopIndices } = pinStops(input.coordinates, stopCoords);

    // Trim the line so it starts and ends exactly at the terminal stations.
    const firstIdx = stopIndices[0];
    const trimmed = pinned.slice(
      firstIdx,
      stopIndices[stopIndices.length - 1] + 1,
    );
    const indices = stopIndices.map((i) => i - firstIdx);

    for (let k = 0; k < stationIds.length - 1; k++) {
      const spanCoords = trimmed.slice(indices[k], indices[k + 1] + 1);
      const fromStation = stationIds[k];
      const toStation = stationIds[k + 1];

      let key = pairKey(fromStation, toStation);
      let corridor = corridors.get(key);

      // Sanity check: if an existing corridor between the same station pair
      // has a very different length, the two routes take different physical
      // paths — keep this route's own geometry under a route-specific key.
      if (corridor) {
        const lenA = pathLength(corridor.coords);
        const lenB = pathLength(spanCoords);
        const ratio =
          Math.max(lenA, lenB) / Math.max(Math.min(lenA, lenB), 1e-12);
        if (ratio > CORRIDOR_LENGTH_RATIO_LIMIT) {
          key = `${key}#${input.routeId}`;
          corridor = corridors.get(key);
        }
      }

      if (!corridor) {
        corridor = {
          coords: spanCoords,
          fromStation,
          routeIds: [],
        };
        corridors.set(key, corridor);
      }

      corridor.routeIds.push(input.routeId);
      refs.push({
        corridorKey: key,
        reversed: fromStation !== corridor.fromStation,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: simplify each unique corridor geometry once (shared corridors
  // are simplified identically for every member route), then assign offset
  // slots.
  // -------------------------------------------------------------------------
  for (const corridor of corridors.values()) {
    corridor.coords = simplify(corridor.coords, SIMPLIFY_TOLERANCE_DEG).map(
      roundCoord,
    );

    // Symmetric slots around 0, sorted by route ID so the same set of routes
    // always gets the same ordering (prevents lines braiding between spans).
    const uniqueRoutes = [...new Set(corridor.routeIds)].sort();
    const n = uniqueRoutes.length;
    corridor.slotByRoute = new Map(
      uniqueRoutes.map((routeId, i) => [routeId, 2 * i - (n - 1)]),
    );
  }

  // -------------------------------------------------------------------------
  // Phase 4: reassemble each route as a list of render segments, merging
  // consecutive spans that share the same offset slot.
  // -------------------------------------------------------------------------
  const segmentsByRoute = new Map<string, RenderSegment[]>();

  for (const input of inputs) {
    const segments: RenderSegment[] = [];
    segmentsByRoute.set(input.routeId, segments);

    for (const ref of spanRefsByRoute.get(input.routeId) ?? []) {
      const corridor = corridors.get(ref.corridorKey)!;
      const slot = corridor.slotByRoute?.get(input.routeId) ?? 0;
      // A positive pixel offset shifts to one side of the direction of
      // travel; when this route traverses the corridor opposite to the
      // canonical direction, negate the slot so the line stays on the same
      // geographic side.
      const offset = ref.reversed ? -slot : slot;
      const coords = ref.reversed
        ? corridor.coords.slice().reverse()
        : corridor.coords;

      const prev = segments[segments.length - 1];
      if (prev && prev.offset === offset) {
        // Continue the previous segment (skip the duplicated joint vertex).
        for (let i = 1; i < coords.length; i++) {
          prev.coordinates.push(coords[i]);
        }
      } else {
        segments.push({ coordinates: coords.slice(), offset });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stations output.
  // -------------------------------------------------------------------------
  const stations: ProcessedStation[] = [...stationById.entries()].map(
    ([stationId, s]) => ({
      stationId,
      stopName: s.stopName,
      lat: s.coord[1],
      lon: s.coord[0],
      lineCount: s.routes.size,
    }),
  );

  return { segmentsByRoute, stations };
}
