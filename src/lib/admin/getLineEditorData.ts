/**
 * Server-only SQLite queries powering the /admin/lines editor API
 * (`src/pages/admin/api/lines/*`).
 *
 * Mirrors the query patterns of `scripts/seed-line-map-trips.ts` (route
 * prefixes, active-services CTE, shape points) and `getRouteShapes.ts`
 * (trip stops filtered to pickup/drop-off, GeoJSON coordinate order).
 */
import { getGtfsDb } from "../gtfsConfig";
import { getAgencyIdsByFlag } from "../agencies";
import getRouteById from "../getRouteById";
import { readLineMapTripsFile } from "./lineMapTripsFile";
import type {
  AdminLineDetail,
  AdminLineInfo,
  AdminLineSummary,
  AdminShape,
  AdminStop,
  AdminTripInfo,
} from "./types";

/** Active services for `@today`, matching the seed script's CTE. */
const ACTIVE_SERVICES_CTE = `
  active_services AS (
    SELECT c.service_id
    FROM calendar c
    WHERE c.start_date <= @today AND c.end_date >= @today
    UNION
    SELECT cd.service_id
    FROM calendar_dates cd
    WHERE cd.date = @today AND cd.exception_type = 1
  )`;

/** Today's date as a GTFS YYYYMMDD string, in Metro's service timezone. */
function todayString(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" })
    .format(new Date())
    .replace(/-/g, "");
}

/**
 * Resolved line color for a route: GTFS route_color, then the agency's
 * default line color, then black — same logic as the line pages.
 */
function resolveLineColor(
  routeColor: string,
  defaultLineColor: string,
): string {
  return routeColor ? `#${routeColor}` : defaultLineColor || "#000";
}

/** Fallback info for routes present in config but missing from the DB. */
function fallbackLineInfo(routeId: string): AdminLineInfo {
  return {
    routeId,
    label: routeId,
    longName: "",
    routeType: 3,
    lineColor: "#000",
  };
}

/**
 * Every line the editor can operate on: all route prefixes that have
 * trips (buildForWeb agencies), unioned with every key already in
 * lineMapTrips.json so a configured route is never uneditable. Sorted
 * numerically for the dropdown / prev-next ordering.
 */
export async function getEditableLines(): Promise<AdminLineSummary[]> {
  const db = getGtfsDb();
  const agencyIds = getAgencyIdsByFlag("buildForWeb");
  const placeholders = agencyIds.map(() => "?").join(", ");

  const routeRows = db
    .prepare(
      `
      SELECT DISTINCT r.route_id
      FROM routes r
      JOIN trips t ON t.route_id = r.route_id
      WHERE r.route_long_name IS NOT NULL AND r.route_long_name != ''
        AND r.agency_id IN (${placeholders})
      ORDER BY r.route_id
    `,
    )
    .all(...agencyIds) as { route_id: string }[];

  const config = readLineMapTripsFile();
  const prefixes = new Set(routeRows.map((r) => r.route_id.split("-")[0]));
  for (const key of Object.keys(config)) prefixes.add(key);

  const lines: AdminLineSummary[] = [];
  for (const routeId of prefixes) {
    let info: AdminLineInfo;
    try {
      const route = await getRouteById(routeId);
      info = {
        routeId,
        label: route.routeShortName,
        longName: route.routeLongName,
        routeType: route.routeType,
        lineColor: resolveLineColor(route.routeColor, route.defaultLineColor),
      };
    } catch {
      info = fallbackLineInfo(routeId);
    }
    const trips = config[routeId]?.trips;
    lines.push({
      ...info,
      hasConfig: Array.isArray(trips) && trips.length > 0,
      configTripCount: trips?.length ?? 0,
    });
  }

  lines.sort((a, b) => {
    const na = Number.parseInt(a.routeId, 10);
    const nb = Number.parseInt(b.routeId, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.routeId.localeCompare(b.routeId);
  });
  return lines;
}

interface TripRow {
  trip_id: string;
  direction_id: number | null;
  shape_id: string | null;
  trip_headsign: string | null;
  service_id: string;
}

interface StopTimeRow {
  trip_id: string;
  stop_id: string;
  boardable: number | null;
  departure_time: string | null;
  stop_headsign: string | null;
}

/** "owl" when the first departure is late night (before 5am or 11pm+). */
function owlHintFromDeparture(departureTime: string): "core" | "owl" {
  const hours = Number.parseInt(departureTime, 10);
  if (!Number.isFinite(hours)) return "core";
  const hour = ((hours % 24) + 24) % 24;
  return hour >= 23 || hour < 5 ? "owl" : "core";
}

/**
 * Extracts the trip's display headsign: GTFS trip_headsign when set,
 * otherwise the last non-empty stop_headsign (Metro bus trips carry the
 * destination on stop_times rather than on the trip). A leading
 * line-number prefix like "2 - " or "10/48 - " is dropped.
 */
function resolveTripHeadsign(row: TripRow, rows: StopTimeRow[]): string {
  let raw = row.trip_headsign ?? "";
  if (!raw) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const headsign = rows[i].stop_headsign;
      if (headsign) {
        raw = headsign;
        break;
      }
    }
  }
  return raw.replace(/^[\dA-Za-z/]+ - /, "");
}

/**
 * The full editor payload for one line: every renderable candidate trip
 * (with its exact stop pattern), every distinct shape geometry, every
 * stop the line serves today (the coverage baseline), and the current
 * saved config.
 */
export async function getLineEditorDetail(
  routeId: string,
): Promise<AdminLineDetail> {
  const db = getGtfsDb();
  const today = todayString();

  let line: AdminLineInfo;
  try {
    const route = await getRouteById(routeId);
    line = {
      routeId,
      label: route.routeShortName,
      longName: route.routeLongName,
      routeType: route.routeType,
      lineColor: resolveLineColor(route.routeColor, route.defaultLineColor),
    };
  } catch {
    line = fallbackLineInfo(routeId);
  }

  const tripRows = db
    .prepare(
      `
      SELECT t.trip_id, t.direction_id, t.shape_id, t.trip_headsign, t.service_id
      FROM trips t
      WHERE t.route_id = @routeId OR t.route_id LIKE @routeId || '-%'
      ORDER BY t.trip_id
    `,
    )
    .all({ routeId }) as TripRow[];

  // One pass over every stop_times row for the line's trips: gives each
  // trip its first departure time and its exact ordered stop pattern
  // (restricted to boarding/alighting stops, like getRouteShapes).
  const tripIds = tripRows.map((r) => r.trip_id);
  const stopTimesByTrip = new Map<string, StopTimeRow[]>();
  if (tripIds.length > 0) {
    const rows = db
      .prepare(
        `
        SELECT st.trip_id, st.stop_id,
               (st.pickup_type = 0 OR st.drop_off_type = 0) AS boardable,
               COALESCE(NULLIF(st.departure_time, ''), st.arrival_time) AS departure_time,
               st.stop_headsign AS stop_headsign
        FROM stop_times st
        WHERE st.trip_id IN (SELECT value FROM json_each(@tripIdsJson))
        ORDER BY st.trip_id, st.stop_sequence
      `,
      )
      .all({ tripIdsJson: JSON.stringify(tripIds) }) as StopTimeRow[];
    for (const row of rows) {
      let list = stopTimesByTrip.get(row.trip_id);
      if (!list) {
        list = [];
        stopTimesByTrip.set(row.trip_id, list);
      }
      list.push(row);
    }
  }

  // Active service IDs (today) — used for the activeToday flag.
  const activeServiceIds = new Set(
    (
      db
        .prepare(
          `WITH ${ACTIVE_SERVICES_CTE} SELECT service_id FROM active_services`,
        )
        .all({ today }) as { service_id: string }[]
    ).map((r) => r.service_id),
  );

  // Candidate trips: must have a shape and at least one boarding/
  // alighting stop. Stop patterns are deduped across trips that share
  // the same ordered stop list, so the payload stays small.
  const stopIdPatterns: Record<string, string[]> = {};
  const patternKeys = new Map<string, string>();
  const candidates: {
    row: TripRow;
    departureTime: string;
    headsign: string;
    stopPatternKey: string;
    stopCount: number;
  }[] = [];

  for (const row of tripRows) {
    if (!row.shape_id) continue;
    const rows = stopTimesByTrip.get(row.trip_id) ?? [];
    if (rows.length === 0) continue;
    const stopIds = rows.filter((r) => r.boardable === 1).map((r) => r.stop_id);
    if (stopIds.length === 0) continue;

    const joined = stopIds.join(",");
    let stopPatternKey = patternKeys.get(joined);
    if (!stopPatternKey) {
      stopPatternKey = `p${patternKeys.size}`;
      patternKeys.set(joined, stopPatternKey);
      stopIdPatterns[stopPatternKey] = stopIds;
    }

    candidates.push({
      row,
      departureTime: rows[0].departure_time ?? "",
      headsign: resolveTripHeadsign(row, rows),
      stopPatternKey,
      stopCount: stopIds.length,
    });
  }

  // Distinct shape geometries for the candidate trips. Trips whose shape
  // has no points are dropped (they would fail getRouteShapes at build).
  const shapeIds = [...new Set(candidates.map((c) => c.row.shape_id!))];
  const shapePointCounts = new Map<string, number>();
  const shapes: AdminShape[] = [];
  if (shapeIds.length > 0) {
    const shapeRows = db
      .prepare(
        `
        SELECT s.shape_id, s.shape_pt_lat, s.shape_pt_lon
        FROM shapes s
        WHERE s.shape_id IN (SELECT value FROM json_each(@shapeIdsJson))
        ORDER BY s.shape_id, s.shape_pt_sequence
      `,
      )
      .all({ shapeIdsJson: JSON.stringify(shapeIds) }) as {
      shape_id: string;
      shape_pt_lat: number;
      shape_pt_lon: number;
    }[];

    const byShape = new Map<string, [number, number][]>();
    for (const r of shapeRows) {
      let coords = byShape.get(r.shape_id);
      if (!coords) {
        coords = [];
        byShape.set(r.shape_id, coords);
      }
      coords.push([r.shape_pt_lon, r.shape_pt_lat]);
    }
    for (const [shapeId, coordinates] of byShape) {
      if (coordinates.length === 0) continue;
      shapePointCounts.set(shapeId, coordinates.length);
      shapes.push({ shapeId, coordinates });
    }
  }

  const trips: AdminTripInfo[] = [];
  for (const c of candidates) {
    if (!shapePointCounts.has(c.row.shape_id!)) continue;
    trips.push({
      tripId: c.row.trip_id,
      directionId: c.row.direction_id,
      headsign: c.headsign,
      serviceId: c.row.service_id,
      departureTime: c.departureTime,
      shapeId: c.row.shape_id!,
      stopPatternKey: c.stopPatternKey,
      stopCount: c.stopCount,
      activeToday: activeServiceIds.has(c.row.service_id),
      owlHint: owlHintFromDeparture(c.departureTime),
    });
  }

  // Coverage baseline: every stop the line serves today where passengers
  // can board or alight (raw stop_ids — physical points, not parents).
  const stops: AdminStop[] = (
    db
      .prepare(
        `
      WITH ${ACTIVE_SERVICES_CTE},
      route_trips AS (
        SELECT t.trip_id
        FROM trips t
        WHERE (t.route_id = @routeId OR t.route_id LIKE @routeId || '-%')
          AND t.service_id IN (SELECT service_id FROM active_services)
      )
      SELECT DISTINCT st.stop_id, s.stop_name, s.stop_lat, s.stop_lon
      FROM stop_times st
      JOIN route_trips rt ON rt.trip_id = st.trip_id
      JOIN stops s ON s.stop_id = st.stop_id
      WHERE (st.pickup_type = 0 OR st.drop_off_type = 0)
      ORDER BY st.stop_id
    `,
      )
      .all({ routeId, today }) as {
      stop_id: string;
      stop_name: string;
      stop_lat: number;
      stop_lon: number;
    }[]
  ).map((r) => ({
    stopId: r.stop_id,
    stopName: r.stop_name,
    lat: r.stop_lat,
    lon: r.stop_lon,
  }));

  return {
    line,
    config: readLineMapTripsFile()[routeId]?.trips ?? null,
    trips,
    shapes,
    stops,
    stopIdPatterns,
  };
}
