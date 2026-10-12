export const prerender = false;

import type { APIRoute } from "astro";
import { getMergedServingRoutes } from "../../../../lib/admin/getScreenEditorData";

const NO_STORE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/** Max stops accepted per preview request (dev-tool safety cap). */
const MAX_PREVIEW_STOPS = 50;

/**
 * GET /admin/api/screens/route-preview?stopIds=A,B,C
 * The routes serving an arbitrary stop list — the same merge the sign page
 * performs — used by the editor to keep the routeOrder list in sync while
 * stopIds are being edited (before anything is saved).
 *
 * Dev server only — the middleware 404s every /admin request in any
 * production build before this handler can run.
 */
export const GET: APIRoute = async ({ url }) => {
  const raw = url.searchParams.get("stopIds") ?? "";
  const stopIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "")
    .slice(0, MAX_PREVIEW_STOPS);

  if (stopIds.length === 0) {
    return new Response(JSON.stringify({ routes: [] }), {
      headers: NO_STORE_HEADERS,
    });
  }

  const routes = await getMergedServingRoutes(stopIds);
  return new Response(JSON.stringify({ routes }), {
    headers: NO_STORE_HEADERS,
  });
};
