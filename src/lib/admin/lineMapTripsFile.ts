/**
 * Server-only read / validate / write helpers for
 * `src/data/lineMapTrips.json`, plus the save-time validation that
 * protects the build from bad config.
 *
 * The admin editor is the only runtime consumer that *writes* this file.
 * Reads go through `fs.readFileSync` (not the Vite JSON import used by
 * `getLineMapTrips.ts`) so a GET right after a POST always reflects what
 * was just written, independent of any module caching.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getGtfsDb } from "../gtfsConfig";
import type { LineMapTrips, LineMapTripConfig } from "../../data/types";

/** Absolute path to the line-map trips config file. */
const LINE_MAP_TRIPS_PATH = fileURLToPath(
  new URL("../../data/lineMapTrips.json", import.meta.url),
);

/** Reads and parses the config file fresh from disk. */
export function readLineMapTripsFile(): LineMapTrips {
  return JSON.parse(readFileSync(LINE_MAP_TRIPS_PATH, "utf-8")) as LineMapTrips;
}

/**
 * Writes the config file with numeric key sorting and the same formatting
 * as `scripts/seed-line-map-trips.ts` (2-space JSON + trailing newline),
 * so an admin save produces clean git diffs. The write is atomic
 * (tmp file + rename) so a crash can never leave a half-written file.
 */
export function writeLineMapTripsFile(config: LineMapTrips): void {
  const sortedKeys = Object.keys(config).sort((a, b) => {
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const sorted = {} as LineMapTrips;
  for (const key of sortedKeys) sorted[key] = config[key];

  const tmpPath = `${LINE_MAP_TRIPS_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, LINE_MAP_TRIPS_PATH);
}

/** Properties allowed on a single trip config entry (typo guard). */
const ALLOWED_TRIP_KEYS = new Set([
  "tripId",
  "directionId",
  "serviceType",
  "splitLineNumber",
  "stopHeadsignFilter",
]);

export type TripValidationResult =
  | { ok: true; trips: LineMapTripConfig[] }
  | { ok: false; errors: string[] };

/**
 * Validates and normalizes a save request body (`{ trips: [...] }`).
 * On success returns the normalized trips: `serviceType` defaults to
 * "core" and empty optional fields are dropped, matching the file's
 * existing style. Unknown properties are rejected (typo guard).
 */
export function validateTripConfigs(body: unknown): TripValidationResult {
  const errors: string[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      errors: ['Body must be a JSON object: { "trips": [...] }'],
    };
  }

  const raw = (body as Record<string, unknown>).trips;
  if (!Array.isArray(raw)) {
    return { ok: false, errors: ['"trips" must be an array.'] };
  }

  const trips: LineMapTripConfig[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of raw.entries()) {
    const label = `trips[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`${label}: must be an object.`);
      continue;
    }
    const obj = entry as Record<string, unknown>;

    for (const key of Object.keys(obj)) {
      if (!ALLOWED_TRIP_KEYS.has(key)) {
        errors.push(`${label}: unknown property "${key}".`);
      }
    }

    const tripId = obj.tripId;
    if (typeof tripId !== "string" || tripId.trim() === "") {
      errors.push(`${label}: "tripId" must be a non-empty string.`);
      continue;
    }
    if (seen.has(tripId)) {
      errors.push(`Duplicate tripId "${tripId}".`);
    }
    seen.add(tripId);

    const directionId = obj.directionId;
    if (
      typeof directionId !== "number" ||
      !Number.isInteger(directionId) ||
      (directionId !== 0 && directionId !== 1)
    ) {
      errors.push(`${label} (${tripId}): "directionId" must be 0 or 1.`);
      continue;
    }

    const serviceType = obj.serviceType ?? "core";
    if (serviceType !== "core" && serviceType !== "owl") {
      errors.push(
        `${label} (${tripId}): "serviceType" must be "core" or "owl".`,
      );
      continue;
    }

    if (
      obj.splitLineNumber !== undefined &&
      (typeof obj.splitLineNumber !== "string" ||
        obj.splitLineNumber.trim() === "")
    ) {
      errors.push(
        `${label} (${tripId}): "splitLineNumber" must be a non-empty string.`,
      );
      continue;
    }

    if (
      obj.stopHeadsignFilter !== undefined &&
      (typeof obj.stopHeadsignFilter !== "string" ||
        obj.stopHeadsignFilter.trim() === "")
    ) {
      errors.push(
        `${label} (${tripId}): "stopHeadsignFilter" must be a non-empty string.`,
      );
      continue;
    }

    const trip: LineMapTripConfig = { tripId, directionId, serviceType };
    if (typeof obj.splitLineNumber === "string") {
      trip.splitLineNumber = obj.splitLineNumber;
    }
    if (typeof obj.stopHeadsignFilter === "string") {
      trip.stopHeadsignFilter = obj.stopHeadsignFilter;
    }
    trips.push(trip);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, trips };
}

/**
 * Cross-checks the submitted trip IDs against the GTFS database: each must
 * exist, belong to the route being saved (route_id prefix match), and have
 * a shape — the same failure modes getRouteShapes hits at build time.
 * Returns human-readable errors for a 400 response (empty = valid).
 */
export function validateTripsAgainstDb(
  routeId: string,
  tripIds: string[],
): string[] {
  if (tripIds.length === 0) return [];

  const db = getGtfsDb();
  const rows = db
    .prepare(
      `
      SELECT t.trip_id, t.route_id, t.shape_id
      FROM trips t
      WHERE t.trip_id IN (SELECT value FROM json_each(@tripIdsJson))
    `,
    )
    .all({ tripIdsJson: JSON.stringify([...new Set(tripIds)]) }) as {
    trip_id: string;
    route_id: string;
    shape_id: string | null;
  }[];
  const byId = new Map(rows.map((r) => [r.trip_id, r]));

  const errors: string[] = [];
  for (const tripId of tripIds) {
    const row = byId.get(tripId);
    if (!row) {
      errors.push(`Trip "${tripId}" does not exist in the GTFS database.`);
      continue;
    }
    const prefix = row.route_id.split("-")[0];
    if (prefix !== routeId) {
      errors.push(
        `Trip "${tripId}" belongs to route ${prefix}, not route ${routeId}.`,
      );
    }
    if (!row.shape_id) {
      errors.push(`Trip "${tripId}" has no shape_id.`);
    }
  }
  return errors;
}
