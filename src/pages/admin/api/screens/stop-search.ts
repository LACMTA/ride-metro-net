export const prerender = false;

import type { APIRoute } from "astro";
import { searchTopLevelStops } from "../../../../lib/admin/getScreenEditorData";

const NO_STORE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/**
 * GET /admin/api/screens/stop-search?q=...
 * Top-level stop lookup for the screens editor's add-stop field: matches
 * stop names (substring) and stop IDs (prefix), and never returns child
 * platform stops (see searchTopLevelStops).
 *
 * Dev server only — the middleware 404s every /admin request in any
 * production build before this handler can run.
 */
export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get("q") ?? "";
  if (query.trim() === "") {
    return new Response(JSON.stringify({ stops: [] }), {
      headers: NO_STORE_HEADERS,
    });
  }

  const stops = searchTopLevelStops(query, 20);
  return new Response(JSON.stringify({ stops }), {
    headers: NO_STORE_HEADERS,
  });
};
