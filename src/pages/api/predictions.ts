export const prerender = false;

import { getGtfsDb } from "../../lib/gtfsConfig";

export type RoutePredictions = {
  destinations: {
    directionId: string;
    headsign: string;
    predictions: Prediction[];
  }[];
  routeId: string;
  routeName: string;
  routeShortName: string;
  stopCode: number;
  stopId: string;
  stopName: string;
};

export type Prediction = {
  min: number;
  sec: number;
  /** Absolute Unix epoch seconds of the predicted arrival. */
  time: number;
  tripId: string;
  vehicleId: string;
};

interface PredictionRow {
  stop_id: string;
  route_id: string;
  trip_id: string;
  direction_id: number | null;
  arrival_timestamp: string | null;
  departure_timestamp: string | null;
  vehicle_id: string | null;
  route_short_name: string | null;
  route_long_name: string | null;
  stop_code: number | null;
  stop_name: string | null;
  raw_headsign: string | null;
}

/**
 * GET /api/predictions
 * @param {string} stopId - Comma-separated list of stop IDs to fetch predictions for.
 *   For parent stations, pass the child stop IDs. Results are aggregated into a single array.
 * @returns {RoutePredictions[]} Aggregated array of predictions across all requested stops.
 */
export async function GET(context: import("astro").APIContext) {
  const stopIdParam = context.url.searchParams.get("stopId");

  if (!stopIdParam)
    return new Response("stopId query parameter is required", { status: 400 });

  const stopIds = stopIdParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (stopIds.length === 0)
    return new Response("stopId query parameter is required", { status: 400 });

  const db = getGtfsDb();
  const placeholders = stopIds.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `
      SELECT
        stu.stop_id,
        stu.route_id,
        stu.trip_id,
        stu.direction_id,
        stu.arrival_timestamp,
        stu.departure_timestamp,
        tu.vehicle_id,
        r.route_short_name,
        r.route_long_name,
        CAST(s.stop_code AS INTEGER) AS stop_code,
        s.stop_name,
        st.stop_headsign AS raw_headsign
      FROM stop_time_updates stu
      JOIN routes r ON r.route_id = stu.route_id
      JOIN stops s ON s.stop_id = stu.stop_id
      LEFT JOIN trip_updates tu ON tu.trip_id = stu.trip_id
      -- Join on the composite PK (trip_id, stop_sequence) for a point
      -- lookup instead of materializing a 3.5M-row GROUP BY subquery.
      -- This also returns the headsign for the specific stop rather
      -- than the alphabetically-first headsign across the whole trip.
      LEFT JOIN stop_times st
        ON st.trip_id = stu.trip_id
        AND st.stop_sequence = stu.stop_sequence
      WHERE stu.stop_id IN (${placeholders})
        AND stu.expiration_timestamp > unixepoch()
        AND (stu.arrival_timestamp IS NOT NULL OR stu.departure_timestamp IS NOT NULL)
      ORDER BY CAST(COALESCE(stu.arrival_timestamp, stu.departure_timestamp) AS INTEGER)
    `,
    )
    .all(...stopIds) as PredictionRow[];

  const nowSec = Math.floor(Date.now() / 1000);

  // Group flat rows into RoutePredictions shape, keyed by route_id.
  // Predictions across all requested stop IDs are merged into a single entry
  // per route so the client sees one unified predictions list per line.
  const byRoute = new Map<string, RoutePredictions>();

  for (const row of rows) {
    const arrivalTs = row.arrival_timestamp
      ? Number(row.arrival_timestamp)
      : row.departure_timestamp
        ? Number(row.departure_timestamp)
        : null;
    if (arrivalTs === null) continue;

    // Strip "Route Name - " prefix from headsign
    // e.g. "Metro A Line - Pomona Station" → "Pomona Station"
    const rawHeadsign = row.raw_headsign ?? "";
    const dashIdx = rawHeadsign.indexOf(" - ");
    const headsign =
      dashIdx >= 0 ? rawHeadsign.slice(dashIdx + 3) : rawHeadsign;

    const { route_id: routeId } = row;
    if (!byRoute.has(routeId)) {
      byRoute.set(routeId, {
        routeId,
        routeName: row.route_long_name ?? "",
        routeShortName: row.route_short_name ?? "",
        stopCode: row.stop_code ?? 0,
        stopId: row.stop_id,
        stopName: row.stop_name ?? "",
        destinations: [],
      });
    }

    const routePred = byRoute.get(routeId)!;
    const directionId = String(row.direction_id ?? 0);

    let dest = routePred.destinations.find(
      (d) => d.directionId === directionId && d.headsign === headsign,
    );
    if (!dest) {
      dest = { directionId, headsign, predictions: [] };
      routePred.destinations.push(dest);
    }

    const sec = arrivalTs - nowSec;
    dest.predictions.push({
      time: arrivalTs,
      sec: Math.max(0, sec),
      min: Math.max(0, Math.floor(sec / 60)),
      tripId: row.trip_id ?? "",
      vehicleId: row.vehicle_id ?? "",
    });
  }

  return new Response(JSON.stringify([...byRoute.values()]), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
