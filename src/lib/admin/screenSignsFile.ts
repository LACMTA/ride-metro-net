/**
 * Server-only read / validate / write helpers for
 * `src/data/screenSigns.json`, plus the save-time validation that
 * protects the build from bad config.
 *
 * The admin screens editor (`/admin/screens`) is the only runtime consumer
 * that *writes* this file. Reads go through `fs.readFileSync` (not the
 * Vite JSON import used by `getScreenSigns.ts`) so a GET right after a
 * POST always reflects what was just written, independent of any module
 * caching.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getGtfsDb } from "../gtfsConfig";
import type { ScreenSigns } from "../../data/types";

/** Absolute path to the screen-signs config file. */
const SCREEN_SIGNS_PATH = fileURLToPath(
  new URL("../../data/screenSigns.json", import.meta.url),
);

/**
 * URL-safe kebab-case slug pattern for sign IDs — the path segment of
 * `/screens/[signId]`. Mirrored client-side by ScreenEditor.
 */
export const SIGN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reads and parses the config file fresh from disk. */
export function readScreenSignsFile(): ScreenSigns {
  return JSON.parse(readFileSync(SCREEN_SIGNS_PATH, "utf-8")) as ScreenSigns;
}

/**
 * Writes the config file with slug keys sorted alphabetically and formatted
 * with the repo's prettier config — `src/data/*.json` is normally edited
 * with format-on-save, so an admin save must reproduce the same formatting
 * byte-for-byte to produce clean git diffs. prettier is a devDependency
 * loaded lazily (this function only ever runs in the dev server); if it
 * can't be loaded, falls back to plain 2-space JSON. The write is atomic
 * (tmp file + rename) so a crash can never leave a half-written file.
 */
export async function writeScreenSignsFile(signs: ScreenSigns): Promise<void> {
  const sortedKeys = Object.keys(signs).sort((a, b) => a.localeCompare(b));
  const sorted = {} as ScreenSigns;
  for (const key of sortedKeys) sorted[key] = signs[key];

  let output = JSON.stringify(sorted, null, 2) + "\n";
  try {
    const prettier = await import("prettier");
    const config = (await prettier.resolveConfig(SCREEN_SIGNS_PATH)) ?? {};
    output = await prettier.format(output, { ...config, parser: "json" });
  } catch {
    // prettier unavailable (e.g. stripped install) — keep plain JSON.
  }

  const tmpPath = `${SCREEN_SIGNS_PATH}.tmp`;
  writeFileSync(tmpPath, output, "utf-8");
  renameSync(tmpPath, SCREEN_SIGNS_PATH);
}

/** Properties allowed on a sign config entry (typo guard). */
const ALLOWED_SIGN_KEYS = new Set(["stopIds", "routeOrder"]);

export type ScreenConfigValidationResult =
  | { ok: true; stopIds: string[]; routeOrder: string[] | null }
  | { ok: false; errors: string[] };

/**
 * Validates and normalizes a save request body. `stopIds` must be a
 * non-empty array of unique non-empty strings. `routeOrder` is optional;
 * when present it must be an array of unique non-empty strings, stored as
 * stable route-ID prefixes — suffixed GTFS IDs (e.g. "33-13167") are
 * normalized to their prefix and re-deduped. A `routeOrder` that is empty
 * after normalization is stored as `null`, i.e. the key is omitted from
 * the file entirely. Unknown properties are rejected (typo guard).
 */
export function validateScreenConfigBody(
  body: unknown,
): ScreenConfigValidationResult {
  const errors: string[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      errors: [
        'Body must be a JSON object: { "stopIds": [...], "routeOrder": [...] }',
      ],
    };
  }

  const obj = body as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_SIGN_KEYS.has(key)) {
      errors.push(`Unknown property "${key}".`);
    }
  }

  const rawStopIds = obj.stopIds;
  if (!Array.isArray(rawStopIds) || rawStopIds.length === 0) {
    errors.push('"stopIds" must be a non-empty array of stop IDs.');
  } else {
    const stopErrors = validateUniqueStrings(rawStopIds, "stopIds");
    if (stopErrors.length > 0) errors.push(...stopErrors);
  }

  let routeOrder: string[] | null = null;
  const rawRouteOrder = obj.routeOrder;
  if (rawRouteOrder !== undefined) {
    if (!Array.isArray(rawRouteOrder)) {
      errors.push('"routeOrder" must be an array of route IDs.');
    } else if (rawRouteOrder.length > 0) {
      const routeErrors = validateUniqueStrings(rawRouteOrder, "routeOrder");
      if (routeErrors.length > 0) {
        errors.push(...routeErrors);
      } else {
        routeOrder = [
          ...new Set(
            (rawRouteOrder as string[]).map((routeId) => {
              return routeId.split("-")[0];
            }),
          ),
        ];
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, stopIds: rawStopIds as string[], routeOrder };
}

/** Array-of-strings shape check: non-empty entries, no duplicates. */
function validateUniqueStrings(arr: unknown[], label: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of arr.entries()) {
    if (typeof entry !== "string" || entry.trim() === "") {
      errors.push(`${label}[${index}] must be a non-empty string.`);
      continue;
    }
    if (seen.has(entry)) errors.push(`Duplicate ${label} entry "${entry}".`);
    seen.add(entry);
  }
  return errors;
}

interface StopValidationRow {
  stop_id: string;
  is_top_level: number;
  parent_station: string;
}

/**
 * Cross-checks submitted stop IDs against the GTFS database: each must
 * exist and be a top-level stop — a parent station or standalone stop
 * with no `parent_station` of its own, the same set of stops the site
 * builds pages for. Returns human-readable errors for a 400 response
 * (empty = valid).
 */
export function validateStopIdsAgainstDb(stopIds: string[]): string[] {
  if (stopIds.length === 0) return [];
  const db = getGtfsDb();
  const rows = db
    .prepare(
      `
      SELECT s.stop_id,
        (s.parent_station IS NULL OR s.parent_station = '') AS is_top_level,
        COALESCE(s.parent_station, '') AS parent_station
      FROM stops s
      WHERE s.stop_id IN (SELECT value FROM json_each(@idsJson))
      `,
    )
    .all({
      idsJson: JSON.stringify([...new Set(stopIds)]),
    }) as StopValidationRow[];
  const byId = new Map(rows.map((row) => [row.stop_id, row]));

  const errors: string[] = [];
  for (const stopId of stopIds) {
    const row = byId.get(stopId);
    if (!row) {
      errors.push(`Stop "${stopId}" does not exist in the GTFS database.`);
      continue;
    }
    if (!row.is_top_level) {
      errors.push(
        `Stop "${stopId}" is a child platform — use its parent station "${row.parent_station}" instead.`,
      );
    }
  }
  return errors;
}

interface RouteValidationRow {
  route_id: string;
  known: number;
}

/**
 * Cross-checks submitted routeOrder entries against the GTFS database:
 * each stable route-ID prefix must match a known route (bare prefix or
 * any of its suffixed variants). Entries that no longer serve the sign's
 * stops are allowed — the sign page silently ignores them — but unknown
 * routes are rejected so the config can't rot silently. Returns
 * human-readable errors for a 400 response (empty = valid).
 */
export function validateRouteOrderAgainstDb(routeOrder: string[]): string[] {
  if (routeOrder.length === 0) return [];
  const db = getGtfsDb();
  const rows = db
    .prepare(
      `
      SELECT j.value AS route_id,
        EXISTS(
          SELECT 1 FROM routes r
          WHERE r.route_id = j.value OR r.route_id LIKE j.value || '-%'
        ) AS known
      FROM json_each(@idsJson) j
      `,
    )
    .all({
      idsJson: JSON.stringify([...new Set(routeOrder)]),
    }) as RouteValidationRow[];
  const byId = new Map(rows.map((row) => [row.route_id, row]));

  const errors: string[] = [];
  for (const routeId of routeOrder) {
    if (!byId.get(routeId)?.known) {
      errors.push(`Route "${routeId}" does not exist in the GTFS database.`);
    }
  }
  return errors;
}
