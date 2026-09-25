export const prerender = false;

import { getEditableLines } from "../../../../lib/admin/getLineEditorData";
import type { AdminLineSummary } from "../../../../lib/admin/types";

/**
 * GET /admin/api/lines
 * Lists every line the editor can operate on (see getEditableLines).
 *
 * Dev server only — the middleware 404s every /admin request in any
 * production build before this handler can run.
 */
export async function GET(): Promise<Response> {
  const lines: AdminLineSummary[] = await getEditableLines();
  return new Response(JSON.stringify({ lines }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
