/**
 * Shared TypeScript interfaces for configuration data files in `src/data/`.
 *
 * These interfaces provide type safety for JSON config files that are imported
 * by application code and potentially edited by a dev-only editor interface.
 */

/**
 * Configuration for a single arrival-board screen sign.
 * Each key in `ScreenSigns` maps a URL-safe `signId` to its config.
 *
 * For now, a sign is simply defined by an array of stop IDs — the same data
 * that the query-parameter-based `/screens/` page accepts. Additional layout
 * options (headers, headsign filters, etc.) can be added to this interface later.
 */
export interface ScreenSignConfig {
  /** GTFS stop IDs whose routes should be merged on this sign. */
  stopIds: string[];

  /**
   * Optional array of `route_id` values that controls the display order of
   * routes on the sign. Routes are sorted to match the order listed here;
   * any routes returned by the query but not listed here appear at the end,
   * preserving their original relative order. Route IDs that are listed
   * but not returned by the query are silently ignored.
   */
  routeOrder?: string[];
}

/**
 * The full screen-signs config file.
 * Keys are URL-safe identifiers used in `/screens/[signId]` paths.
 */
export interface ScreenSigns {
  [signId: string]: ScreenSignConfig;
}

/**
 * A single trip entry in the line-map config.
 * Identifies a canonical trip whose shape and stops should be rendered
 * on the map for a given route.
 */
export interface LineMapTripConfig {
  /** GTFS `trip_id` of the canonical trip for this direction/service. */
  tripId: string;
  /** GTFS `direction_id` (0 or 1) for this trip. */
  directionId: number;
  /**
   * Which service period this trip represents:
   * - `"core"`: the route's primary daytime service (default if omitted).
   * - `"owl"`: late-night service running on a different routing.
   */
  serviceType?: "core" | "owl";
  /**
   * For split-line routes only: the line number (e.g. `"217"` or `"218"`)
   * that this trip belongs to. Absent for non-split-line routes.
   */
  splitLineNumber?: string;
  /**
   * When set, only stops whose `stop_headsign` contains this string are
   * included in the feature. Used by the mixed-trip fallback for split-line
   * sub-lines where no single-headsign trips exist — the trip serves both
   * sub-lines, but only stops belonging to this sub-line should be shown.
   */
  stopHeadsignFilter?: string;
}

/**
 * Configuration for a single route's map display.
 * Each key in `LineMapTrips` maps a numeric route ID prefix to its config.
 */
export interface LineMapRouteConfig {
  trips: LineMapTripConfig[];
}

/**
 * The full line-map trips config file.
 * Keys are numeric route ID prefixes (e.g. "801", "720").
 */
export interface LineMapTrips {
  [routeId: string]: LineMapRouteConfig;
}
