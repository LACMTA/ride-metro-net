export const prerender = false;

import { getGtfsDb } from "../../lib/gtfsConfig";
import { prodCacheHeader } from "../../lib/prodCacheHeader";

/**
 * Grace period (in seconds) after a predicted arrival/departure time has
 * passed before the prediction is excluded from API responses. This prevents
 * stale "0 minute" predictions from lingering in the UI between polls.
 * Tune this value to adjust how long arrivals remain visible after their
 * predicted time.
 */
const PREDICTION_EXPIRY_GRACE_SECONDS = 30;

/**
 * Default maximum number of predictions to return per route per direction.
 * The soonest arrivals across all headsigns in a direction are kept.
 * Callers may override via the `limit` query parameter.
 */
const DEFAULT_PREDICTIONS_LIMIT = 3;

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
 * @param {number} [limit] - Maximum number of predictions to return per route per direction.
 *   The soonest arrivals across all headsigns in a direction are kept. Defaults to 3.
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

  // Optional `limit` query param: cap predictions per route per direction.
  const limitParam = context.url.searchParams.get("limit");
  let limit = DEFAULT_PREDICTIONS_LIMIT;
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return new Response("limit query parameter must be a positive integer", {
        status: 400,
      });
    }
    limit = parsed;
  }

  const db = getGtfsDb();
  const placeholders = stopIds.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `
      WITH deduped_stu AS (
        SELECT
          stu.*,
          ROW_NUMBER() OVER (
            PARTITION BY stu.trip_id, stu.stop_id, stu.stop_sequence
            ORDER BY stu.created_timestamp DESC
          ) AS _dedupe_rank
        FROM stop_time_updates stu
        WHERE stu.stop_id IN (${placeholders})
          AND stu.expiration_timestamp > unixepoch()
          AND (stu.arrival_timestamp IS NOT NULL OR stu.departure_timestamp IS NOT NULL)
          -- Exclude predictions whose arrival/departure time has passed by more
          -- than the grace period, preventing stale "0 minute" predictions.
          AND CAST(COALESCE(stu.arrival_timestamp, stu.departure_timestamp) AS INTEGER) > unixepoch() - ${PREDICTION_EXPIRY_GRACE_SECONDS}
      )
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
      FROM deduped_stu stu
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
      WHERE stu._dedupe_rank = 1
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

  // Cap predictions per route per direction. For each direction, merge all
  // predictions across headsigns, sort by arrival time, keep the soonest
  // `limit`, then redistribute them back to their respective destinations.
  // Destinations emptied by the cap are pruned.
  for (const routePred of byRoute.values()) {
    const byDirection = new Map<
      string,
      { directionId: string; headsign: string; predictions: Prediction[] }[]
    >();
    for (const dest of routePred.destinations) {
      if (!byDirection.has(dest.directionId))
        byDirection.set(dest.directionId, []);
      byDirection.get(dest.directionId)!.push(dest);
    }

    routePred.destinations = [];
    for (const dirDests of byDirection.values()) {
      const all: {
        time: number;
        dest: (typeof dirDests)[0];
        pred: Prediction;
      }[] = [];
      for (const dest of dirDests)
        for (const pred of dest.predictions)
          all.push({ time: pred.time, dest, pred });

      all.sort((a, b) => a.time - b.time);
      const kept = all.slice(0, limit);

      for (const dest of dirDests) {
        const preds = kept.filter((k) => k.dest === dest).map((k) => k.pred);
        if (preds.length > 0) {
          dest.predictions = preds;
          routePred.destinations.push(dest);
        }
      }
    }
  }

  return new Response(JSON.stringify([...byRoute.values()]), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": prodCacheHeader(50, 50),
    },
  });
}
