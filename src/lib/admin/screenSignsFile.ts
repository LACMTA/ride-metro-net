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
import type {
  DisplayOrderComponent,
  DisplayOrderEntry,
  ScreenRouteStopComponent,
  ScreenSigns,
} from "../../data/types";

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
const ALLOWED_SIGN_KEYS = new Set(["stopIds", "displayOrder"]);

/** Component types allowed in `displayOrder`. Keep in sync with
 * `DisplayOrderComponent` in `src/data/types.ts`, the sign page's render
 * loop, and the admin editor's row rendering.
 */
const KNOWN_DISPLAY_COMPONENTS = new Set(["header", "route-stop"]);

/** Properties allowed on each component type (typo guard). */
const COMPONENT_PROPERTIES: Record<string, Set<string>> = {
  header: new Set(["component", "text"]),
  "route-stop": new Set(["component", "routeId", "stopId", "directionId"]),
};

export type ScreenConfigValidationResult =
  | { ok: true; stopIds: string[]; displayOrder: DisplayOrderEntry[] }
  | { ok: false; errors: string[] };

/**
 * Validates one `displayOrder` component object against its component's
 * schema. Returns the normalized component, or null (after pushing
 * human-readable errors) when the entry is invalid.
 */
function validateComponentEntry(
  entry: Record<string, unknown>,
  index: number,
  errors: string[],
): DisplayOrderComponent | null {
  const { component } = entry;
  if (
    typeof component !== "string" ||
    !KNOWN_DISPLAY_COMPONENTS.has(component)
  ) {
    errors.push(
      `displayOrder[${index}] has unknown component ${JSON.stringify(component ?? null)} — known components: ${[...KNOWN_DISPLAY_COMPONENTS].join(", ")}.`,
    );
    return null;
  }

  for (const key of Object.keys(entry)) {
    if (!COMPONENT_PROPERTIES[component].has(key)) {
      errors.push(
        `displayOrder[${index}] "${component}" objects may not have a "${key}" property.`,
      );
    }
  }

  if (component === "header") {
    if (typeof entry.text !== "string" || entry.text.trim() === "") {
      errors.push(
        `displayOrder[${index}] header "text" must be a non-empty string.`,
      );
      return null;
    }
    return { component: "header", text: entry.text.trim() };
  }

  if (component === "route-stop") {
    const { routeId, stopId, directionId } = entry;
    if (typeof routeId !== "string" || routeId.trim() === "") {
      errors.push(
        `displayOrder[${index}] route-stop "routeId" must be a non-empty string.`,
      );
      return null;
    }
    if (typeof stopId !== "string" || stopId.trim() === "") {
      errors.push(
        `displayOrder[${index}] route-stop "stopId" must be a non-empty string.`,
      );
      return null;
    }
    if (directionId !== undefined && directionId !== 0 && directionId !== 1) {
      errors.push(
        `displayOrder[${index}] route-stop "directionId" must be 0 or 1 when present.`,
      );
      return null;
    }
    const normalized: ScreenRouteStopComponent = {
      component: "route-stop",
      // Normalize suffixed GTFS route IDs to the stable prefix.
      routeId: routeId.trim().split("-")[0],
      stopId: stopId.trim(),
      ...(directionId === undefined
        ? {}
        : { directionId: directionId as 0 | 1 }),
    };
    return normalized;
  }

  return null;
}

/**
 * Validates and normalizes a save request body. `stopIds` must be a
 * non-empty array of unique non-empty strings. `displayOrder` is required:
 * an array of component objects, each using a known `component` type with
 * exactly that component's allowed properties — `{ component: "header",
 * text: "..." }` headers and `{ component: "route-stop", routeId, stopId,
 * directionId? }` route-stop pairs. Route-stop `routeId`s are normalized to
 * their stable prefix (suffixed GTFS IDs like "33-13167" are stored as
 * "33"); duplicate route-stop pairs are rejected, and route-stop `stopId`s
 * must reference one of the sign's `stopIds`. Bare route-ID strings are no
 * longer accepted — every route row must name its stop. Unknown properties
 * are rejected (typo guard).
 */
export function validateScreenConfigBody(
  body: unknown,
): ScreenConfigValidationResult {
  const errors: string[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      errors: [
        'Body must be a JSON object: { "stopIds": [...], "displayOrder": [...] }',
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

  // The sign's stopIds as submitted — route-stop entries must reference one.
  const stopIdSet = new Set(
    Array.isArray(rawStopIds)
      ? rawStopIds.filter((id): id is string => typeof id === "string")
      : [],
  );

  const rawDisplayOrder = obj.displayOrder;
  let displayOrder: DisplayOrderEntry[] | null = null;
  if (!Array.isArray(rawDisplayOrder)) {
    errors.push(
      '"displayOrder" must be an array of component objects ("route-stop" pairs and/or "header" components).',
    );
  } else {
    displayOrder = [];
    const seenRouteStops = new Set<string>();
    for (const [index, entry] of rawDisplayOrder.entries()) {
      if (typeof entry === "object" && entry !== null) {
        const component = validateComponentEntry(
          entry as Record<string, unknown>,
          index,
          errors,
        );
        if (component) {
          if (component.component === "route-stop") {
            const pairKey = `${component.routeId}:${component.stopId}:${component.directionId ?? "*"}`;
            if (seenRouteStops.has(pairKey)) {
              errors.push(
                `Duplicate displayOrder route-stop entry: route "${component.routeId}" at stop "${component.stopId}"` +
                  (component.directionId !== undefined
                    ? ` (direction ${component.directionId})`
                    : "") +
                  ".",
              );
              continue;
            }
            seenRouteStops.add(pairKey);
            if (stopIdSet.size > 0 && !stopIdSet.has(component.stopId)) {
              errors.push(
                `displayOrder[${index}] route-stop references stop "${component.stopId}", which is not in this sign's stopIds.`,
              );
            }
          }
          displayOrder.push(component);
        }
      } else {
        errors.push(
          `displayOrder[${index}] must be a component object — a "route-stop" pair or a "header". Bare route-ID strings are no longer supported; name the stop with a route-stop pair instead.`,
        );
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    stopIds: rawStopIds as string[],
    displayOrder: displayOrder ?? [],
  };
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
 * Cross-checks the `routeId` of every submitted route-stop component against
 * the GTFS database: each stable route-ID prefix must match a known route
 * (bare prefix or any of its suffixed variants). Header components are
 * skipped — they aren't route IDs. Pairs that no longer serve the sign's
 * stops are allowed — the sign page silently ignores them — but unknown
 * routes are rejected so the config can't rot silently. Returns
 * human-readable errors for a 400 response (empty = valid).
 */
export function validateDisplayOrderAgainstDb(
  displayOrder: DisplayOrderEntry[],
): string[] {
  const routeIds = displayOrder.flatMap((entry) =>
    entry.component === "route-stop" ? [entry.routeId] : [],
  );
  if (routeIds.length === 0) return [];
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
      idsJson: JSON.stringify([...new Set(routeIds)]),
    }) as RouteValidationRow[];
  const byId = new Map(rows.map((row) => [row.route_id, row]));

  const errors: string[] = [];
  for (const routeId of routeIds) {
    if (!byId.get(routeId)?.known) {
      errors.push(`Route "${routeId}" does not exist in the GTFS database.`);
    }
  }
  return errors;
}
