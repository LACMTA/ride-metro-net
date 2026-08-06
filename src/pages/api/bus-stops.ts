export const prerender = false;

import { getGtfsDb } from "../../lib/gtfsConfig";

export interface BusStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
}

interface BusStopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

/**
 * GET /api/bus-stops?bbox=west,south,east,north
 *
 * Returns bus stops (location_type 0 or NULL, no parent_station) within the
 * given bounding box. The bounding box should be snapped to a fixed grid on
 * the client so that repeated requests for the same area produce identical
 * URLs and benefit from HTTP caching.
 *
 * @param {string} bbox - Comma-separated `west,south,east,north` in lng/lat.
 * @returns {{ stops: BusStop[] }}
 */
export async function GET(context: import("astro").APIContext) {
  const bboxParam = context.url.searchParams.get("bbox");
  if (!bboxParam) {
    return new Response("bbox query parameter is required", { status: 400 });
  }

  const parts = bboxParam.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return new Response(
      "bbox must be four comma-separated numbers: west,south,east,north",
      { status: 400 },
    );
  }

  const [west, south, east, north] = parts;
  if (west > east || south > north) {
    return new Response("bbox must satisfy west <= east and south <= north", {
      status: 400,
    });
  }

  const db = getGtfsDb();

  const rows = db
    .prepare(
      `
      SELECT stop_id, stop_name, stop_lat, stop_lon
      FROM stops
      WHERE stop_lat BETWEEN ? AND ?
        AND stop_lon BETWEEN ? AND ?
        AND (location_type = 0 OR location_type IS NULL)
        AND parent_station IS NULL
      `,
    )
    .all(south, north, west, east) as BusStopRow[];

  const stops: BusStop[] = rows.map((row) => ({
    stopId: row.stop_id,
    stopName: row.stop_name,
    lat: row.stop_lat,
    lon: row.stop_lon,
  }));

  return new Response(JSON.stringify({ stops }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
