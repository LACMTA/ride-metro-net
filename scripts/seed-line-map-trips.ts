/**
 * Seed script: generates `src/data/lineMapTrips.json` from the current GTFS
 * database using the same selection logic as the old `getRouteShapes.ts`
 * (most-used shape per direction, owl service detection, split-line handling).
 *
 * Usage: npx tsx scripts/seed-line-map-trips.ts
 */

import { getGtfsDb } from "../src/lib/gtfsConfig";
import { getAgencyIdsByFlag } from "../src/lib/agencies";
import type Database from "better-sqlite3";
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// SQL constants
// ---------------------------------------------------------------------------

const ACTIVE_SERVICES_CTE = `
  active_services AS (
    SELECT c.service_id
    FROM calendar c
    WHERE c.start_date <= @today
      AND c.end_date >= @today
    UNION
    SELECT cd.service_id
    FROM calendar_dates cd
    WHERE cd.date = @today AND cd.exception_type = 1
  )`;

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const db = getGtfsDb();

const stmts = {
  // All route IDs that have trips and belong to agencies with buildLinePages flag
  allRoutes: db.prepare(`
    SELECT DISTINCT r.route_id
    FROM routes r
    JOIN trips t ON t.route_id = r.route_id
    WHERE r.route_long_name IS NOT NULL AND r.route_long_name != ''
      AND r.agency_id IN (${getAgencyIdsByFlag("buildLinePages").map(() => "?").join(", ")})
    ORDER BY r.route_id
  `),

  // route_type and route_short_name for a given route id
  routeType: db.prepare(`
    SELECT route_type, route_short_name
    FROM routes
    WHERE route_id = @routeId OR route_id LIKE @routeId || '-%'
    LIMIT 1
  `),

  // Most-used shape_id per direction_id among active trips
  shapeIds: db.prepare(`
    WITH ${ACTIVE_SERVICES_CTE},
    shape_counts AS (
      SELECT t.direction_id,
             t.shape_id,
             COUNT(*) AS trip_count
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.shape_id IS NOT NULL
        AND t.shape_id != ''
        AND t.service_id IN (SELECT service_id FROM active_services)
      GROUP BY t.direction_id, t.shape_id
    )
    SELECT sc.direction_id,
           MIN(sc.shape_id) AS shape_id,
           sc.trip_count
    FROM shape_counts sc
    WHERE sc.trip_count = (
      SELECT MAX(sc2.trip_count)
      FROM shape_counts sc2
      WHERE sc2.direction_id IS sc.direction_id
    )
    GROUP BY sc.direction_id, sc.trip_count
  `),

  // Most-used shape_id per direction_id restricted to a set of trip_ids
  shapeIdsFromTrips: db.prepare(`
    WITH owl_trip_ids AS (
      SELECT value AS trip_id FROM json_each(@tripIdsJson)
    ),
    shape_counts AS (
      SELECT t.direction_id,
             t.shape_id,
             COUNT(*) AS trip_count
      FROM trips t
      WHERE t.trip_id IN (SELECT trip_id FROM owl_trip_ids)
        AND t.shape_id IS NOT NULL
        AND t.shape_id != ''
      GROUP BY t.direction_id, t.shape_id
    )
    SELECT sc.direction_id,
           MIN(sc.shape_id) AS shape_id,
           sc.trip_count
    FROM shape_counts sc
    WHERE sc.trip_count = (
      SELECT MAX(sc2.trip_count)
      FROM shape_counts sc2
      WHERE sc2.direction_id IS sc.direction_id
    )
    GROUP BY sc.direction_id, sc.trip_count
  `),

  // Representative trip_id for a given shape_id (lexicographically smallest)
  repTrip: db.prepare(`
    SELECT MIN(t.trip_id) AS trip_id
    FROM trips t
    WHERE t.shape_id = ?
  `),

  // Representative trip_id for a given shape_id, restricted to a set of trip_ids
  repTripFromTrips: db.prepare(`
    SELECT MIN(t.trip_id) AS trip_id
    FROM trips t
    WHERE t.shape_id = @shapeId
      AND t.trip_id IN (SELECT value FROM json_each(@tripIdsJson))
  `),

  // Owl trips: trips whose every stop_time is in [23:00, 05:00)
  owlTrips: db.prepare(`
    WITH ${ACTIVE_SERVICES_CTE},
    route_trips AS (
      SELECT t.trip_id
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.service_id IN (SELECT service_id FROM active_services)
    )
    SELECT rt.trip_id
    FROM route_trips rt
    WHERE NOT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id = rt.trip_id
        AND (
          (CAST(
            substr(
              COALESCE(NULLIF(st.departure_time, ''), st.arrival_time),
              1,
              instr(COALESCE(NULLIF(st.departure_time, ''), st.arrival_time), ':') - 1
            ) AS INTEGER
          ) % 24) BETWEEN 5 AND 22
        )
    )
  `),

  // Owl trips from a pre-filtered set of trip IDs
  owlTripsFromTripIds: db.prepare(`
    SELECT ct.trip_id
    FROM (SELECT value AS trip_id FROM json_each(@tripIdsJson)) ct
    WHERE NOT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id = ct.trip_id
        AND (
          (CAST(
            substr(
              COALESCE(NULLIF(st.departure_time, ''), st.arrival_time),
              1,
              instr(COALESCE(NULLIF(st.departure_time, ''), st.arrival_time), ':') - 1
            ) AS INTEGER
          ) % 24) BETWEEN 5 AND 22
        )
    )
  `),

  // Owl trips from a pre-filtered set of trip IDs, restricted to a headsign
  owlTripsFromTripIdsByHeadsign: db.prepare(`
    SELECT ct.trip_id
    FROM (SELECT value AS trip_id FROM json_each(@tripIdsJson)) ct
    WHERE NOT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id = ct.trip_id
        AND (
          (CAST(
            substr(
              COALESCE(NULLIF(st.departure_time, ''), st.arrival_time),
              1,
              instr(COALESCE(NULLIF(st.departure_time, ''), st.arrival_time), ':') - 1
            ) AS INTEGER
          ) % 24) BETWEEN 5 AND 22
        )
    )
    AND EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id = ct.trip_id
        AND st.stop_headsign LIKE '%' || @lineNumber || '%'
    )
  `),

  // Whether owl trips visit a non-core stop
  owlVisitsNonCore: db.prepare(`
    SELECT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id IN (SELECT value FROM json_each(@owlTripIdsJson))
        AND (st.pickup_type = 0 OR st.drop_off_type = 0)
        AND st.stop_id NOT IN (SELECT value FROM json_each(@coreStopIdsJson))
    ) AS visits_non_core
  `),

  // Whether owl trips visit a non-core stop (headsign filtered)
  owlVisitsNonCoreByHeadsign: db.prepare(`
    SELECT EXISTS (
      SELECT 1
      FROM stop_times st
      WHERE st.trip_id IN (SELECT value FROM json_each(@owlTripIdsJson))
        AND (st.pickup_type = 0 OR st.drop_off_type = 0)
        AND st.stop_headsign LIKE '%' || @lineNumber || '%'
        AND st.stop_id NOT IN (SELECT value FROM json_each(@coreStopIdsJson))
    ) AS visits_non_core
  `),

  // Stops for a shape (representative trip)
  shapeStops: db.prepare(`
    SELECT s.stop_id
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = (
      SELECT MIN(t.trip_id)
      FROM trips t
      WHERE t.shape_id = ?
    )
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    ORDER BY st.stop_sequence ASC
  `),

  // Stops for a shape restricted to a set of trip_ids
  shapeStopsFromTrips: db.prepare(`
    SELECT s.stop_id
    FROM stop_times st
    JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = (
      SELECT MIN(t.trip_id)
      FROM trips t
      WHERE t.shape_id = @shapeId
        AND t.trip_id IN (SELECT value FROM json_each(@tripIdsJson))
    )
      AND (st.pickup_type = 0 OR st.drop_off_type = 0)
    ORDER BY st.stop_sequence ASC
  `),

  // Split-line trips: trips whose every stop_time shares a single headsign
  splitLineTrips: db.prepare(`
    WITH ${ACTIVE_SERVICES_CTE},
    route_trips AS (
      SELECT t.trip_id
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.service_id IN (SELECT service_id FROM active_services)
    )
    SELECT rt.trip_id, MAX(st.stop_headsign) AS headsign
    FROM route_trips rt
    JOIN stop_times st ON st.trip_id = rt.trip_id
    WHERE st.stop_headsign IS NOT NULL AND st.stop_headsign != ''
    GROUP BY rt.trip_id
    HAVING COUNT(DISTINCT st.stop_headsign) = 1
  `),

  // Trips with any matching headsign
  tripsWithAnyMatchingHeadsign: db.prepare(`
    WITH ${ACTIVE_SERVICES_CTE},
    route_trips AS (
      SELECT t.trip_id
      FROM trips t
      WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
        AND t.service_id IN (SELECT service_id FROM active_services)
    )
    SELECT DISTINCT rt.trip_id
    FROM route_trips rt
    JOIN stop_times st ON st.trip_id = rt.trip_id
    WHERE st.stop_headsign LIKE '%' || @lineNumber || '%'
  `),
} satisfies Record<string, Database.Statement>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ShapeIdRow {
  direction_id: number | null;
  shape_id: string;
  trip_count: number;
}

function getServiceDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  })
    .format(now)
    .replace(/-/g, "");
}

function headsignMatchesLineNumber(
  headsign: string,
  lineNumber: string,
): boolean {
  return new RegExp(`(?<!\\d)${lineNumber}(?!\\d)`).test(headsign);
}

interface TripConfigEntry {
  tripId: string;
  directionId: number;
  serviceType?: "core" | "owl";
  splitLineNumber?: string;
  stopHeadsignFilter?: string;
}

// ---------------------------------------------------------------------------
// Processing functions (mirrors the old getRouteShapes logic)
// ---------------------------------------------------------------------------

function processTripGroup(
  tripIdsJson: string,
  splitLineNumber: string | undefined,
  isBusRoute: boolean,
  stopHeadsignFilter?: string,
): { trips: TripConfigEntry[]; hasOwlService: boolean } {
  const trips: TripConfigEntry[] = [];
  const coreStopIds = new Set<string>();

  // Core: most-used shape per direction within this trip group
  const shapeRows = stmts.shapeIdsFromTrips.all({
    tripIdsJson,
  }) as ShapeIdRow[];

  for (const { shape_id, direction_id } of shapeRows) {
    // Get representative trip_id for this shape
    const repTripRow = stmts.repTripFromTrips.get({
      shapeId: shape_id,
      tripIdsJson,
    }) as { trip_id: string } | undefined;

    if (!repTripRow?.trip_id) continue;

    // Get stops for this shape to build core stop set
    const stops = stmts.shapeStopsFromTrips.all({
      shapeId: shape_id,
      tripIdsJson,
    }) as { stop_id: string }[];

    for (const s of stops) coreStopIds.add(s.stop_id);

    trips.push({
      tripId: repTripRow.trip_id,
      directionId: direction_id ?? 0,
      serviceType: "core",
      ...(splitLineNumber && { splitLineNumber }),
      ...(stopHeadsignFilter && { stopHeadsignFilter }),
    });
  }

  // Owl detection (bus routes only)
  let hasOwlService = false;

  if (isBusRoute && coreStopIds.size > 0) {
    const owlTripRows = stopHeadsignFilter
      ? (stmts.owlTripsFromTripIdsByHeadsign.all({
          tripIdsJson,
          lineNumber: stopHeadsignFilter,
        }) as { trip_id: string }[])
      : (stmts.owlTripsFromTripIds.all({ tripIdsJson }) as {
          trip_id: string;
        }[]);

    if (owlTripRows.length > 0) {
      const owlTripIds = owlTripRows.map((r) => r.trip_id);
      const owlTripIdsJson = JSON.stringify(owlTripIds);
      const coreStopIdsJson = JSON.stringify([...coreStopIds]);

      const visitsRow = stopHeadsignFilter
        ? (stmts.owlVisitsNonCoreByHeadsign.get({
            owlTripIdsJson,
            coreStopIdsJson,
            lineNumber: stopHeadsignFilter,
          }) as { visits_non_core: number } | undefined)
        : (stmts.owlVisitsNonCore.get({
            owlTripIdsJson,
            coreStopIdsJson,
          }) as { visits_non_core: number } | undefined);

      if (visitsRow?.visits_non_core === 1) {
        const owlShapeRows = stmts.shapeIdsFromTrips.all({
          tripIdsJson: owlTripIdsJson,
        }) as ShapeIdRow[];

        for (const { shape_id, direction_id } of owlShapeRows) {
          const repTripRow = stmts.repTripFromTrips.get({
            shapeId: shape_id,
            tripIdsJson: owlTripIdsJson,
          }) as { trip_id: string } | undefined;

          if (!repTripRow?.trip_id) continue;

          trips.push({
            tripId: repTripRow.trip_id,
            directionId: direction_id ?? 0,
            serviceType: "owl",
            ...(splitLineNumber && { splitLineNumber }),
            ...(stopHeadsignFilter && { stopHeadsignFilter }),
          });
          hasOwlService = true;
        }
      }
    }
  }

  return { trips, hasOwlService };
}

function processRoute(
  routeIdPrefix: string,
): { trips: TripConfigEntry[] } | null {
  const today = getServiceDate();

  const routeTypeRow = stmts.routeType.get({ routeId: routeIdPrefix }) as
    | { route_type: number; route_short_name: string }
    | undefined;

  if (!routeTypeRow) return null;

  const isBusRoute = routeTypeRow.route_type === 3;
  const routeShortName = routeTypeRow.route_short_name ?? "";

  // ---- Split-line detection ----
  const splitMatch = /^(\d+)\/(\d+)$/.exec(routeShortName);

  if (splitMatch) {
    const [lineA, lineB] = [splitMatch[1], splitMatch[2]];

    const tripRows = stmts.splitLineTrips.all({
      routeId: routeIdPrefix,
      today,
    }) as { trip_id: string; headsign: string }[];

    const groupA: string[] = [];
    const groupB: string[] = [];

    for (const { trip_id, headsign } of tripRows) {
      if (headsignMatchesLineNumber(headsign, lineA)) {
        groupA.push(trip_id);
      } else if (headsignMatchesLineNumber(headsign, lineB)) {
        groupB.push(trip_id);
      }
    }

    const allTrips: TripConfigEntry[] = [];

    for (const [lineNumber, group] of [
      [lineA, groupA],
      [lineB, groupB],
    ] as [string, string[]][]) {
      if (group.length > 0) {
        const { trips } = processTripGroup(
          JSON.stringify(group),
          lineNumber,
          isBusRoute,
        );
        allTrips.push(...trips);
        continue;
      }

      // Fallback: mixed trips
      const fallbackRows = stmts.tripsWithAnyMatchingHeadsign.all({
        routeId: routeIdPrefix,
        today,
        lineNumber,
      }) as { trip_id: string }[];

      if (fallbackRows.length === 0) continue;

      const fallbackTripIds = fallbackRows.map((r) => r.trip_id);
      const { trips } = processTripGroup(
        JSON.stringify(fallbackTripIds),
        lineNumber,
        isBusRoute,
        lineNumber,
      );
      allTrips.push(...trips);
    }

    return { trips: allTrips };
  }

  // ---- Non-split route: original pipeline ----

  const shapeRows = stmts.shapeIds.all({
    routeId: routeIdPrefix,
    today,
  }) as ShapeIdRow[];

  const allTrips: TripConfigEntry[] = [];
  const coreStopIds = new Set<string>();

  for (const { shape_id, direction_id } of shapeRows) {
    const repTripRow = stmts.repTrip.get(shape_id) as
      | { trip_id: string }
      | undefined;

    if (!repTripRow?.trip_id) continue;

    const stops = stmts.shapeStops.all(shape_id) as { stop_id: string }[];
    for (const s of stops) coreStopIds.add(s.stop_id);

    allTrips.push({
      tripId: repTripRow.trip_id,
      directionId: direction_id ?? 0,
      serviceType: "core",
    });
  }

  // ---- Owl service detection (bus routes only) ----
  if (isBusRoute && coreStopIds.size > 0) {
    const owlTripRows = stmts.owlTrips.all({
      routeId: routeIdPrefix,
      today,
    }) as { trip_id: string }[];

    if (owlTripRows.length > 0) {
      const owlTripIds = owlTripRows.map((r) => r.trip_id);
      const owlTripIdsJson = JSON.stringify(owlTripIds);
      const coreStopIdsJson = JSON.stringify([...coreStopIds]);

      const visitsRow = stmts.owlVisitsNonCore.get({
        owlTripIdsJson,
        coreStopIdsJson,
      }) as { visits_non_core: number } | undefined;

      if (visitsRow?.visits_non_core === 1) {
        const owlShapeRows = stmts.shapeIdsFromTrips.all({
          tripIdsJson: owlTripIdsJson,
        }) as ShapeIdRow[];

        for (const { shape_id, direction_id } of owlShapeRows) {
          const repTripRow = stmts.repTripFromTrips.get({
            shapeId: shape_id,
            tripIdsJson: owlTripIdsJson,
          }) as { trip_id: string } | undefined;

          if (!repTripRow?.trip_id) continue;

          allTrips.push({
            tripId: repTripRow.trip_id,
            directionId: direction_id ?? 0,
            serviceType: "owl",
          });
        }
      }
    }
  }

  return { trips: allTrips };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const agencyIds = getAgencyIdsByFlag("buildLinePages");
const allRoutes = stmts.allRoutes.all.apply(stmts.allRoutes, agencyIds) as unknown as { route_id: string }[];

const uniquePrefixes = [
  ...new Set(allRoutes.map((route) => route.route_id.split("-")[0])),
];

const config: Record<string, { trips: TripConfigEntry[] }> = {};

for (const numericPrefix of uniquePrefixes) {
  const result = processRoute(numericPrefix);
  if (result && result.trips.length > 0) {
    config[numericPrefix] = { trips: result.trips };
  }
}

const outputPath = "src/data/lineMapTrips.json";
writeFileSync(outputPath, JSON.stringify(config, null, 2) + "\n");

console.log(`Wrote ${Object.keys(config).length} route configs to ${outputPath}`);