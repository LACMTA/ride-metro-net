import { getGtfsDb } from "./gtfsConfig";
import { getLineMapTripList } from "./getLineMapTrips";
import type Database from "better-sqlite3";

/**
 * GeoJSON `FeatureCollection` of `LineString`s — one per configured trip —
 * for a given route. Each feature contains the shape geometry and ordered
 * stops for the trip identified in the `lineMapTrips.json` config.
 */
export interface RouteShapesGeoJSON {
  type: "FeatureCollection";
  /**
   * `true` when this route has at least one trip configured with
   * `serviceType: "owl"`.
   */
  hasOwlService: boolean;
  /**
   * `true` when this route has at least one trip configured with a
   * `splitLineNumber` property.
   */
  isSplitline: boolean;
  features: RouteShapeFeature[];
}

export interface RouteStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  /**
   * The parent station ID for this stop, or the stop's own ID when the stop
   * is standalone (no `parent_station`). Used for linking to stop pages,
   * which are generated for parent stops rather than child/platform stops.
   */
  parentStationId: string;
}

export interface RouteShapeFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    /** Array of `[longitude, latitude]` pairs in GeoJSON order. */
    coordinates: [number, number][];
  };
  properties: {
    /** The `shape_id` for this trip's shape. */
    shapeIds: string[];
    /** The `direction_id` for this trip (wrapped in an array for compatibility). */
    directionIds: (number | null)[];
    /** Ordered list of stops served by this trip. */
    stops: RouteStop[];
    /**
     * Which service period this feature represents:
     * - `"core"`: the route's primary daytime service.
     * - `"owl"`: late-night service running on a different routing.
     */
    serviceType: "core" | "owl";
    /**
     * For split-line routes only: the line number (e.g. `"217"` or `"218"`)
     * that this feature belongs to. Absent for non-split-line routes.
     */
    splitLineNumber?: string;
  };
}

interface ShapePointRow {
  shape_pt_lat: number;
  shape_pt_lon: number;
}

interface StopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  parent_station: string | null;
}

interface TripRow {
  shape_id: string;
  direction_id: number | null;
}

// ---------------------------------------------------------------------------
// Polyline trimming utilities
// ---------------------------------------------------------------------------

/**
 * Squared Euclidean distance in lon/lat space — sufficient for finding the
 * nearest shape point within the bounds of a single route.
 */
function dist2(
  coord: [number, number],
  targetLon: number,
  targetLat: number,
): number {
  return (coord[0] - targetLon) ** 2 + (coord[1] - targetLat) ** 2;
}

/**
 * Returns the index of the coordinate in `coords` that is closest to
 * `[targetLon, targetLat]`, scanning from `startAt` toward `endAt`
 * (inclusive, direction determined by sign of `endAt - startAt`).
 */
function nearestIndex(
  coords: [number, number][],
  targetLon: number,
  targetLat: number,
  startAt: number,
  endAt: number,
): number {
  const step = endAt >= startAt ? 1 : -1;
  let bestIdx = startAt;
  let bestDist = Infinity;
  for (let i = startAt; step > 0 ? i <= endAt : i >= endAt; i += step) {
    const d = dist2(coords[i], targetLon, targetLat);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Trims a polyline's coordinates so they don't extend beyond the first and
 * last stops. Finds the nearest shape point to each terminal stop and slices
 * the coordinates array to that range.
 *
 * This is especially important for the split-line mixed-trip fallback, where
 * the full shape covers both sub-lines but only one sub-line's stops are shown.
 */
function trimCoordinates(
  allCoords: [number, number][],
  stops: RouteStop[],
): [number, number][] {
  if (stops.length < 2) return allCoords;
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const startIdx = nearestIndex(
    allCoords,
    firstStop.lon,
    firstStop.lat,
    0,
    allCoords.length - 1,
  );
  const endIdx = nearestIndex(
    allCoords,
    lastStop.lon,
    lastStop.lat,
    allCoords.length - 1,
    0,
  );
  return startIdx < endIdx
    ? allCoords.slice(startIdx, endIdx + 1)
    : allCoords;
}

// ---------------------------------------------------------------------------
// Prepared statements (lazily initialised on the shared DB connection)
// ---------------------------------------------------------------------------

const _stmts: Partial<{
  trip: Database.Statement;
  shapePoints: Database.Statement;
  shapeStops: Database.Statement;
  shapeStopsFiltered: Database.Statement;
}> = {};

function getTripQuery() {
  return (_stmts.trip ??= getGtfsDb().prepare(`
    SELECT shape_id, direction_id
    FROM trips
    WHERE trip_id = ?
  `));
}

function getShapePointsQuery() {
  return (_stmts.shapePoints ??= getGtfsDb().prepare(`
    SELECT shape_pt_lat, shape_pt_lon
    FROM shapes
    WHERE shape_id = ?
    ORDER BY shape_pt_sequence ASC
  `));
}

/**
 * Returns the ordered stops for a given `trip_id`, in stop-sequence order.
 * Only stops where the trip provides pickup or drop-off service are included.
 */
function getTripStopsQuery() {
  return (_stmts.shapeStops ??= getGtfsDb().prepare(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.parent_station
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = ?
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    ORDER BY st.stop_sequence ASC
  `));
}

/**
 * Like {@link getTripStopsQuery}, but additionally filters to only those
 * stops whose `stop_headsign` contains `@headsignFilter` as a substring.
 * Used for split-line mixed-trip fallback where the trip serves both
 * sub-lines, but only stops belonging to one sub-line should be shown.
 */
function getTripStopsFilteredQuery() {
  return (_stmts.shapeStopsFiltered ??= getGtfsDb().prepare(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, s.parent_station
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = @tripId
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
      AND st.stop_headsign LIKE '%' || @headsignFilter || '%'
    ORDER BY st.stop_sequence ASC
  `));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a `RouteShapesGeoJSON` for the given route by looking up the
 * canonical trip IDs from the `lineMapTrips.json` config and querying the
 * database for each trip's shape geometry and ordered stops.
 *
 * @param routeId Numeric route ID prefix (e.g. "801", "720").
 * @returns GeoJSON FeatureCollection, or `null` if no config exists.
 */
export default function getRouteShapes(routeId: string): RouteShapesGeoJSON | null {
  const trips = getLineMapTripList(routeId);
  if (!trips || trips.length === 0) {
    return null;
  }

  const tripQuery = getTripQuery();
  const shapePointsQuery = getShapePointsQuery();
  const tripStopsQuery = getTripStopsQuery();
  const tripStopsFilteredQuery = getTripStopsFilteredQuery();

  const features: RouteShapeFeature[] = [];
  let hasOwlService = false;
  let isSplitline = false;

  for (const tripConfig of trips) {
    const tripRow = tripQuery.get(tripConfig.tripId) as TripRow | undefined;
    if (!tripRow || !tripRow.shape_id) {
      continue;
    }

    const shapePoints = shapePointsQuery.all(tripRow.shape_id) as ShapePointRow[];
    if (shapePoints.length === 0) {
      continue;
    }

    const stops = tripConfig.stopHeadsignFilter
      ? (tripStopsFilteredQuery.all({
          tripId: tripConfig.tripId,
          headsignFilter: tripConfig.stopHeadsignFilter,
        }) as StopRow[])
      : (tripStopsQuery.all(tripConfig.tripId) as StopRow[]);

    const serviceType = tripConfig.serviceType ?? "core";
    if (serviceType === "owl") hasOwlService = true;
    if (tripConfig.splitLineNumber) isSplitline = true;

    const allCoords = shapePoints.map(
      (p) => [p.shape_pt_lon, p.shape_pt_lat] as [number, number],
    );
    const routeStops = stops.map((s) => ({
      stopId: s.stop_id,
      stopName: s.stop_name,
      lat: s.stop_lat,
      lon: s.stop_lon,
      parentStationId: s.parent_station || s.stop_id,
    }));

    // Trim the polyline to match the first and last stops. This ensures the
    // shape doesn't extend beyond the terminal stops — important for
    // split-line routes (both mixed-trip fallback and dedicated-trip variants)
    // where the full shape may cover a longer path than the displayed stops.
    const coordinates = trimCoordinates(allCoords, routeStops);

    const feature: RouteShapeFeature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {
        shapeIds: [tripRow.shape_id],
        directionIds: [tripRow.direction_id],
        stops: routeStops,
        serviceType,
        ...(tripConfig.splitLineNumber && {
          splitLineNumber: tripConfig.splitLineNumber,
        }),
      },
    };

    features.push(feature);
  }

  return {
    type: "FeatureCollection",
    hasOwlService,
    isSplitline,
    features,
  };
}