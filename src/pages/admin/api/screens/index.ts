export const prerender = false;

import { getScreenSummaries } from "../../../../lib/admin/getScreenEditorData";

/**
 * GET /admin/api/screens
 * Lists every configured screen sign (see getScreenSummaries).
 *
 * Dev server only — the middleware 404s every /admin request in any
 * production build before this handler can run.
 */
export async function GET(): Promise<Response> {
  const signs = getScreenSummaries();
  return new Response(JSON.stringify({ signs }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
