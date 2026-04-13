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
