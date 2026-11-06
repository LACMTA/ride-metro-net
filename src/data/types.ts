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
 * Pixel dimensions of the physical screen a sign targets (e.g. 1920×1080).
 * The sign page renders a fixed-size board of exactly these dimensions and
 * paginates any content that would overflow it. See `src/lib/screenLayout.ts`
 * for the shared row-height constants and page-packing math.
 */
export interface ScreenDimensions {
  /** Target screen width in px (e.g. 1920). */
  width: number;
  /** Target screen height in px (e.g. 1080). */
  height: number;
}

/**
 * Pagination timing for a sign. When the paginated `displayOrder` overflows
 * the space left on the target `dimensions` (after `fixedComponents`), the
 * sign splits it into pages that rotate automatically on a fixed interval,
 * with progress dots at the bottom of the board — the active dot's ring
 * fills over the interval to show how long until the next page displays.
 */
export interface ScreenPaginationSettings {
  /**
   * How long each page displays before flipping, in milliseconds. Defaults
   * to `DEFAULT_PAGINATION_INTERVAL_MS` (10s). Must be at least
   * `PAGINATION_INTERVAL_MIN_MS`.
   */
  intervalMs?: number;
}

/**
 * Configuration for a single arrival-board screen sign.
 * Each key in `ScreenSigns` maps a URL-safe `signId` to its config.
 *
 * A sign is defined by an array of stop IDs plus a required `displayOrder`
 * that declares exactly what the sign shows, in order. Optional
 * `dimensions` size the board for a physical screen, `fixedComponents`
 * pin content above the paginating list, and `pagination` tunes the flip.
 */
export interface ScreenSignConfig {
  /** GTFS stop IDs whose routes should be merged on this sign. */
  stopIds: string[];

  /**
   * Required. The paginated list: exactly what the sign displays, in order —
   * `route-stop` components (each rendering the card(s) for one exact route +
   * stop pair, so duplicates between nearby stops serving the same route are
   * excluded intentionally) and/or header components. Only pairs listed here
   * are displayed — routes serving the configured stops but not listed are
   * omitted. Pairs that no longer serve the sign's stops are kept and
   * silently skipped at render time. When the resolved list overflows the
   * height available on the target `dimensions`, it is split into pages that
   * rotate automatically.
   */
  displayOrder: DisplayOrderEntry[];

  /**
   * Optional. Pixel dimensions of the physical screen the sign targets
   * (e.g. `{ "width": 1920, "height": 1080 }`). The sign page renders a
   * fixed-size board of exactly these dimensions, scaled down only to fit
   * smaller browser windows for previewing. Defaults to 1920×1080.
   */
  dimensions?: ScreenDimensions;

  /**
   * Optional. Pagination timing for the `displayOrder` list. Only applies
   * when the list overflows the available height (more than one page).
   */
  pagination?: ScreenPaginationSettings;

  /**
   * Optional. Components that render in a fixed zone at the top of the
   * board and never paginate (e.g. a station-name header). Same component
   * types as `displayOrder`; a `route-stop` pair may not appear in both
   * lists. Their height reduces the space available for paginated pages.
   */
  fixedComponents?: DisplayOrderEntry[];
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
