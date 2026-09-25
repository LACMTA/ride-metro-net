/**
 * Shared types for the dev-only line-map config editor (`/admin/lines`).
 *
 * Imported by both the server-side admin API endpoints
 * (`src/pages/admin/api/lines/*`) and the client-side React components
 * (`src/components/admin/*`), so these types must stay free of any
 * server-only imports.
 */
import type { LineMapTripConfig } from "../../data/types";

/** One selectable line in the admin editor's dropdown. */
export interface AdminLineSummary {
  /** Numeric route ID prefix (e.g. "801", "720") — the lineMapTrips.json key. */
  routeId: string;
  /** Resolved display name ("A" for rail, "720" for bus). */
  label: string;
  /** GTFS route_long_name. */
  longName: string;
  /** GTFS route_type. */
  routeType: number;
  /** Resolved line color (hex with leading "#"), same logic as line pages. */
  lineColor: string;
  /** Whether an entry exists for this route in lineMapTrips.json. */
  hasConfig: boolean;
  /** Number of trips configured for this route (0 when unconfigured). */
  configTripCount: number;
}

/** Line metadata included in the detail payload. */
export interface AdminLineInfo {
  routeId: string;
  label: string;
  longName: string;
  routeType: number;
  lineColor: string;
}

/**
 * A candidate trip for the line — every GTFS trip for the route prefix
 * that can render on a map (non-empty shape and at least one
 * boarding/alighting stop).
 */
export interface AdminTripInfo {
  tripId: string;
  directionId: number | null;
  /** Display headsign: trip_headsign, or the trip's stop_headsign. */
  headsign: string;
  serviceId: string;
  /** First stop's departure_time ("HH:MM:SS"; hours may exceed 24 for owl). */
  departureTime: string;
  shapeId: string;
  /** Key into AdminLineDetail.stopIdPatterns for this trip's exact stops. */
  stopPatternKey: string;
  /** Number of boarding/alighting stops served by this trip. */
  stopCount: number;
  /** Whether the trip's service_id is active today. */
  activeToday: boolean;
  /** Heuristic hint: "owl" when the first departure is late night. */
  owlHint: "core" | "owl";
}

/** A physical stop served by the line (the coverage-checking baseline). */
export interface AdminStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
}

/** One distinct shape geometry for the line (drawn once on the map). */
export interface AdminShape {
  shapeId: string;
  /** GeoJSON order: [longitude, latitude] pairs. */
  coordinates: [number, number][];
}

/**
 * Full editor payload for one line: everything needed to draw all
 * candidate trips, compute stop coverage for the current config, and
 * edit the config.
 */
export interface AdminLineDetail {
  line: AdminLineInfo;
  /** Current saved trips for this route, or null when unconfigured. */
  config: LineMapTripConfig[] | null;
  trips: AdminTripInfo[];
  shapes: AdminShape[];
  /**
   * Every distinct stop the line serves today (boarding/alighting
   * allowed) — the coverage baseline.
   */
  stops: AdminStop[];
  /**
   * Deduped exact ordered stop-id lists for candidate trips, keyed by
   * each trip's stopPatternKey. Coverage = union of the patterns of the
   * configured trips.
   */
  stopIdPatterns: Record<string, string[]>;
}

/** POST body for saving a line's config. */
export interface AdminSaveRequest {
  trips: LineMapTripConfig[];
}

/** POST response after a successful save. */
export interface AdminSaveResponse {
  savedRouteId: string;
  /** The normalized config that was written to lineMapTrips.json. */
  trips: LineMapTripConfig[];
}

/** How the editor map renders the line's stops. */
export type StopDisplayMode = "uncovered" | "all" | "none";

/**
 * Filter for the configured-trips list — mirrors the line page's
 * LineMapControls (split line, service type, direction). A null dimension
 * doesn't filter on that dimension.
 */
export interface ConfigTripFilter {
  /** Selected `splitLineNumber`, or null. */
  splitLineNumber: string | null;
  /** Selected GTFS `direction_id`, or null. */
  directionId: number | null;
  /** Selected service type, or null. */
  serviceType: "core" | "owl" | null;
}
