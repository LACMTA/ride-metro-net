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
