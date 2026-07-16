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