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

// ---------------------------------------------------------------------------
// Screen-signs editor (/admin/screens)
// ---------------------------------------------------------------------------

/** One selectable screen sign in the screens editor's dropdown. */
export interface AdminScreenSummary {
  /** URL-safe sign slug — the screenSigns.json key. */
  signId: string;
  /** Number of stop IDs configured for the sign. */
  stopCount: number;
  /** Number of entries in the sign's routeOrder (0 when absent). */
  routeOrderCount: number;
}

/** A top-level stop result from the screens editor's stop lookup. */
export interface AdminScreenStopLookupResult {
  stopId: string;
  stopName: string;
  /** True when the stop is a parent station (e.g. Union Station "80214S"). */
  isParentStation: boolean;
}

/** Resolved info for one stop ID in a sign's stopIds. */
export interface AdminScreenStop {
  stopId: string;
  /** GTFS stop_name ("" when the stop no longer exists). */
  stopName: string;
  /** Whether the stop exists in the GTFS database. */
  found: boolean;
  /** True when the stop is a parent station. */
  isParentStation: boolean;
}

/** One route row in the screens editor's routeOrder list. */
export interface AdminScreenRouteInfo {
  /** Stable route-ID prefix (e.g. "801", "33") — the routeOrder value. */
  routeId: string;
  /** Resolved display short name ("B" for rail, "33" for bus). */
  label: string;
  /** GTFS route_long_name ("" when unknown). */
  longName: string;
  /** GTFS route_type. */
  routeType: number;
  /** GTFS route_color, hex without leading "#" ("" when unknown). */
  routeColor: string;
  /** GTFS route_text_color, hex without leading "#" ("" when unknown). */
  routeTextColor: string;
  /** False when the route no longer exists in the GTFS database at all. */
  known: boolean;
}

/**
 * Full editor payload for one screen sign: the saved config, resolved info
 * for each configured stop, the routes serving those stops (merged the same
 * way the public sign page merges them), and info for routeOrder entries
 * that no longer serve the sign.
 */
export interface AdminScreenDetail {
  signId: string;
  /** The saved config; routeOrder is null when absent from the file. */
  config: { stopIds: string[]; routeOrder: string[] | null };
  /** Resolved info per configured stop ID, in config order. */
  stops: AdminScreenStop[];
  /**
   * Routes serving the sign's stops, merged and deduped by stable
   * route-ID prefix in the order the public sign page renders them.
   */
  servingRoutes: AdminScreenRouteInfo[];
  /**
   * Info for saved routeOrder entries that do not serve the sign's stops —
   * either still-known routes (known: true) or IDs no longer in GTFS
   * (known: false, label falls back to the raw ID).
   */
  staleRoutes: AdminScreenRouteInfo[];
}

/** POST response after a successful save. */
export interface AdminScreenSaveResponse {
  savedSignId: string;
  /** The normalized stopIds written to screenSigns.json. */
  stopIds: string[];
  /** The normalized routeOrder written to screenSigns.json (null when omitted). */
  routeOrder: string[] | null;
}
