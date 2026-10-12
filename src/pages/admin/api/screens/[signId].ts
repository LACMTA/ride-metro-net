export const prerender = false;

import type { APIRoute } from "astro";
import { getScreenDetail } from "../../../../lib/admin/getScreenEditorData";
import {
  readScreenSignsFile,
  SIGN_ID_PATTERN,
  validateRouteOrderAgainstDb,
  validateScreenConfigBody,
  validateStopIdsAgainstDb,
  writeScreenSignsFile,
} from "../../../../lib/admin/screenSignsFile";
import type { AdminScreenSaveResponse } from "../../../../lib/admin/types";
import type { ScreenSignConfig } from "../../../../data/types";

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
 * GET /admin/api/screens/[signId]
 * Full editor payload for one sign: the saved config, resolved info for
 * each configured stop, and the routes serving those stops.
 */
export const GET: APIRoute = async ({ params }) => {
  const signId = params.signId ?? "";
  if (!signId) return errorResponse(["Missing signId."], 400);

  const detail = await getScreenDetail(signId);
  if (!detail) return errorResponse([`Unknown sign: ${signId}`], 404);
  return new Response(JSON.stringify(detail), { headers: NO_STORE_HEADERS });
};

/**
 * POST /admin/api/screens/[signId]
 * Creates or replaces this sign's entry in src/data/screenSigns.json with
 * the request body's config (validated against the request shape and the
 * GTFS database). stopIds must be non-empty; an empty routeOrder omits the
 * key from the file entirely.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const signId = params.signId ?? "";
  if (!signId) return errorResponse(["Missing signId."], 400);
  if (!SIGN_ID_PATTERN.test(signId)) {
    return errorResponse(
      [
        `Sign ID "${signId}" must be a URL-safe kebab-case slug (lowercase letters, digits, and hyphens, e.g. "union-station-east-tower").`,
      ],
      400,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(["Request body must be valid JSON."], 400);
  }

  const validation = validateScreenConfigBody(body);
  if (!validation.ok) return errorResponse(validation.errors, 400);

  const stopErrors = validateStopIdsAgainstDb(validation.stopIds);
  if (stopErrors.length > 0) return errorResponse(stopErrors, 400);

  const routeErrors = validateRouteOrderAgainstDb(validation.routeOrder ?? []);
  if (routeErrors.length > 0) return errorResponse(routeErrors, 400);

  const signs = readScreenSignsFile();
  const entry: ScreenSignConfig = { stopIds: validation.stopIds };
  if (validation.routeOrder) entry.routeOrder = validation.routeOrder;
  signs[signId] = entry;
  await writeScreenSignsFile(signs);

  const responseBody: AdminScreenSaveResponse = {
    savedSignId: signId,
    stopIds: validation.stopIds,
    routeOrder: validation.routeOrder,
  };
  return new Response(JSON.stringify(responseBody), {
    headers: NO_STORE_HEADERS,
  });
};

/**
 * DELETE /admin/api/screens/[signId]
 * Removes this sign's entry from src/data/screenSigns.json.
 */
export const DELETE: APIRoute = async ({ params }) => {
  const signId = params.signId ?? "";
  if (!signId) return errorResponse(["Missing signId."], 400);

  const signs = readScreenSignsFile();
  if (!(signId in signs)) {
    return errorResponse([`Unknown sign: ${signId}`], 404);
  }

  delete signs[signId];
  await writeScreenSignsFile(signs);

  return new Response(JSON.stringify({ deletedSignId: signId }), {
    headers: NO_STORE_HEADERS,
  });
};
