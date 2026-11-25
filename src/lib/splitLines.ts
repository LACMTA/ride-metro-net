/**
 * Split-line helpers — for GTFS routes that run two lines under one route ID
 * (e.g. "10/48"), where the sub-line is distinguishable only by the prefix
 * of the raw `stop_headsign` ("48 - Avalon Station" vs
 * "10 - Downtown LA - 7th - Hill").
 *
 * Shared by the arrival-board sign page (`/screens/[signId]`) and the admin
 * screens editor, and usable anywhere else that scopes a display to one
 * sub-line via a headsign filter. Pure TypeScript — safe in server and
 * client bundles alike.
 */

/**
 * The sub-line prefix of a raw GTFS headsign — the text before the first
 * " - " (e.g. "48" in "48 - Avalon Station"). Split-line routes carry their
 * sub-line only here. Null when the headsign has no prefix.
 */
export function headsignLinePrefix(rawHeadsign: string): string | null {
  const idx = rawHeadsign.indexOf(" - ");
  return idx > 0 ? rawHeadsign.slice(0, idx) : null;
}

/**
 * The badge display name for a row scoped to one sub-line of a split-line
 * route: when every matched raw headsign carries the same sub-line prefix
 * and that prefix is one of the halves of the route's combined "N/M" short
 * name (e.g. "48" of "10/48"), the badge shows just that sub-line.
 * Returns null otherwise — callers keep the route's full short name.
 *
 * The short-name guard keeps non-split prefixes out of badges: raw headsigns
 * on regular routes also carry a "Line - " prefix (e.g. "Metro A Line -
 * Pomona Station") that must never replace the badge name, and a filter
 * matching headsigns of more than one sub-line — or none — leaves the badge
 * as the combined name.
 */
export function resolveSplitLineBadgeName(
  routeShortName: string,
  matchedRawHeadsigns: string[],
): string | null {
  const prefixes = new Set(
    matchedRawHeadsigns
      .map((rawHeadsign) => headsignLinePrefix(rawHeadsign))
      .filter((prefix): prefix is string => prefix !== null),
  );
  if (prefixes.size !== 1) return null;
  const [prefix] = [...prefixes];
  return routeShortName
    .split("/")
    .map((part) => part.trim())
    .includes(prefix)
    ? prefix
    : null;
}
