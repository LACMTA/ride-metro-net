/**
 * Shared TypeScript interfaces for configuration data files in `src/data/`.
 *
 * These interfaces provide type safety for JSON config files that are imported
 * by application code and potentially edited by a dev-only editor interface.
 */

/**
 * A header component in a sign's `displayOrder`: a full-width section heading
 * rendered between route rows (e.g. "Bus Arrivals").
 */
export interface ScreenHeaderComponent {
  component: "header";
  /** Heading text displayed on the sign. */
  text: string;
}

/**
 * A route-stop component in a sign's `displayOrder`: renders the merged
 * route card(s) for one route at one specific configured stop. Signs that
 * include multiple nearby stops serving the same route use these to select
 * the exact pair(s) they want and intentionally exclude duplicates.
 */
export interface ScreenRouteStopComponent {
  component: "route-stop";
  /** Stable route-ID prefix (e.g. "33", "802"). */
  routeId: string;
  /** Config-level stop ID — must be one of the sign's `stopIds`. */
  stopId: string;
  /**
   * Optional: render only this direction's card at the stop. Omit to render
   * every direction the stop serves for the route (e.g. both rail
   * directions at a station).
   */
  directionId?: 0 | 1;
}

/**
 * Rich component objects allowed in a sign's `displayOrder`. New component
 * types are added by extending this union, the sign page's render loop
 * (`/screens/[signId]`), the admin editor's row rendering, and the save-time
 * validation whitelist in `src/lib/admin/screenSignsFile.ts`.
 */
export type DisplayOrderComponent =
  | ScreenHeaderComponent
  | ScreenRouteStopComponent;

/**
 * One entry in a sign's `displayOrder`: a rich component object — either a
 * `route-stop` pair (a route rendered at one exact stop) or a header. Every
 * route row names its stop explicitly; there is no bare route-ID shorthand.
 */
export type DisplayOrderEntry = DisplayOrderComponent;

/**
 * Configuration for a single arrival-board screen sign.
 * Each key in `ScreenSigns` maps a URL-safe `signId` to its config.
 *
 * A sign is defined by an array of stop IDs plus a required `displayOrder`
 * that declares exactly what the sign shows, in order.
 */
export interface ScreenSignConfig {
  /** GTFS stop IDs whose routes should be merged on this sign. */
  stopIds: string[];

  /**
   * Required. Exactly what the sign displays, in order: `route-stop`
   * components (each rendering the card(s) for one exact route + stop pair,
   * so duplicates between nearby stops serving the same route are excluded
   * intentionally) and/or header components. Only pairs listed here are
   * displayed — routes serving the configured stops but not listed are
   * omitted. Pairs that no longer serve the sign's stops are kept and
   * silently skipped at render time.
   */
  displayOrder: DisplayOrderEntry[];
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
