/**
 * Stable route ID prefix → display letter for routes without a route_short_name in GTFS.
 * Rail IDs are fully stable. Rapid bus IDs carry a release-specific suffix
 * (e.g. "901-13196"), so we match only on the numeric prefix before the dash.
 */
export const ROUTE_SHORT_NAME_OVERRIDES: Record<string, string> = {
  "801": "A",
  "802": "B",
  "803": "C",
  "804": "E",
  "805": "D",
  "807": "K",
  "901": "G",
  "910": "J",
};

/**
 * Lowercase display letter → numeric route ID prefix.
 * Inverse of ROUTE_SHORT_NAME_OVERRIDES, used to resolve a lettered URL slug
 * (e.g. "a") back to the stable numeric prefix (e.g. "801") for DB lookups.
 */
export const ROUTE_ID_BY_SHORT_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTE_SHORT_NAME_OVERRIDES).map(([id, letter]) => [
    letter.toLowerCase(),
    id,
  ]),
);

/**
 * Route ID prefixes that the GTFS lists as bus (type 3) but which Metro
 * operates as dedicated busways and should be rendered like rail lines.
 * Currently: G Line (901) and J Line (910).
 */
export const BUSWAY_ROUTE_PREFIXES = new Set(["901", "910"]);

/**
 * Returns the URL slug for a given route ID.
 * Lettered routes (A–K) use the lowercase letter; all others use the numeric
 * prefix directly (e.g. "720" → "720").
 */
export function getLineSlug(routeId: string): string {
  const prefix = routeId.split("-")[0];
  const letter = ROUTE_SHORT_NAME_OVERRIDES[prefix];
  return letter ? letter.toLowerCase() : prefix;
}

/**
 * Returns true when a route is a busway (G or J Line) — i.e. GTFS type 3 but
 * rendered with rail-style badges.
 */
export function isBuswayRoute(routeId: string): boolean {
  const prefix = routeId.split("-")[0];
  return BUSWAY_ROUTE_PREFIXES.has(prefix);
}

/**
 * Resolves a display short name from a route_id and raw route_short_name.
 * If the raw name is empty, uses the ROUTE_SHORT_NAME_OVERRIDES map.
 */
export function resolveRouteShortName(
  routeId: string,
  rawShortName: string,
): string {
  if (rawShortName) return rawShortName;
  const prefix = routeId.split("-")[0];
  return ROUTE_SHORT_NAME_OVERRIDES[prefix] ?? rawShortName;
}
