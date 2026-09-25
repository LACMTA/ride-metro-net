export const prerender = false;

import type { APIRoute } from "astro";
import {
  getEditableLines,
  getLineEditorDetail,
} from "../../../../lib/admin/getLineEditorData";
import {
  readLineMapTripsFile,
  validateTripConfigs,
  validateTripsAgainstDb,
  writeLineMapTripsFile,
} from "../../../../lib/admin/lineMapTripsFile";
import type { AdminSaveResponse } from "../../../../lib/admin/types";

const NO_STORE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/** 400/404-style response carrying a list of human-readable errors. */
function errorResponse(errors: string[], status: number): Response {
  return new Response(JSON.stringify({ errors }), {
    status,
    headers: NO_STORE_HEADERS,
  });
}

/**
 * GET /admin/api/lines/[routeId]
 * Full editor payload for one line: candidate trips (with exact stop
 * patterns), distinct shape geometries, the stop coverage baseline, and
 * the current saved config.
 */
export const GET: APIRoute = async ({ params }) => {
  const routeId = params.routeId ?? "";
  if (!routeId) return errorResponse(["Missing routeId."], 400);

  const detail = await getLineEditorDetail(routeId);
  return new Response(JSON.stringify(detail), { headers: NO_STORE_HEADERS });
};

/**
 * POST /admin/api/lines/[routeId]
 * Replaces this route's entry in src/data/lineMapTrips.json with the
 * request body's trips array (validated against the request shape and
 * the GTFS database). An empty trips array removes the entry entirely,
 * mirroring the seed script's behavior.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const routeId = params.routeId ?? "";
  if (!routeId) return errorResponse(["Missing routeId."], 400);

  // Only allow saving lines that appear in the editor's own list.
  const lines = await getEditableLines();
  if (!lines.some((line) => line.routeId === routeId)) {
    return errorResponse([`Unknown route: ${routeId}`], 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(["Request body must be valid JSON."], 400);
  }

  const validation = validateTripConfigs(body);
  if (!validation.ok) return errorResponse(validation.errors, 400);

  const dbErrors = validateTripsAgainstDb(
    routeId,
    validation.trips.map((t) => t.tripId),
  );
  if (dbErrors.length > 0) return errorResponse(dbErrors, 400);

  const config = readLineMapTripsFile();
  if (validation.trips.length === 0) delete config[routeId];
  else config[routeId] = { trips: validation.trips };
  writeLineMapTripsFile(config);

  const responseBody: AdminSaveResponse = {
    savedRouteId: routeId,
    trips: validation.trips,
  };
  return new Response(JSON.stringify(responseBody), {
    headers: NO_STORE_HEADERS,
  });
};
