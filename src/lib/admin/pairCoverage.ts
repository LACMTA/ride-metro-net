/**
 * Coverage math for the screens admin editor's available route-stop pairs —
 * whether the sign's draft `route-stop` entries already render everything a
 * serving pair offers, per served direction and per raw headsign.
 *
 * Pure TypeScript — no server-only imports. The pair and entry types are
 * type-only imports, so they're erased and never reach the client bundle.
 */
import type { ScreenRouteStopComponent } from "../../data/types";
import type { AdminScreenRouteStopInfo } from "./types";

/**
 * One unit of a pair's offer space — what a `route-stop` entry can be scoped
 * to. A pair serves one cell per (served direction, raw headsign), or one per
 * served direction when its trips carry no headsigns at all (`rawHeadsign`
 * null). Directions the pair doesn't serve (e.g. an arrival-side direction
 * the stop query filters out) contribute no cells.
 */
export interface PairCoverageCell {
  /** GTFS `direction_id` this cell belongs to. */
  directionId: 0 | 1;
  /**
   * The raw GTFS `stop_headsign` this cell covers (e.g. "489 - Temple City"),
   * or null for a headsign-less direction, covered per direction only.
   */
  rawHeadsign: string | null;
}

/**
 * Whether one draft `route-stop` entry renders one coverage cell — the same
 * semantics the sign page applies at build time:
 * - An unscoped entry (no direction, no filter) renders every cell.
 * - A direction-scoped entry renders only cells in that direction.
 * - A `headsignFilter` matches cells whose raw headsign contains it
 *   (trimmed, case-insensitive substring — the `matchesHeadsignFilter` rule).
 * - A filter never matches a headsign-less cell: the sign page warns and
 *   skips a filtered row whose filter matches no scheduled headsigns.
 */
function entryCoversCell(
  entry: ScreenRouteStopComponent,
  cell: PairCoverageCell,
): boolean {
  if (
    entry.directionId !== undefined &&
    entry.directionId !== cell.directionId
  ) {
    return false;
  }
  const filter = entry.headsignFilter?.trim().toLowerCase() ?? "";
  if (filter === "") return true;
  if (cell.rawHeadsign === null) return false;
  return cell.rawHeadsign.toLowerCase().includes(filter);
}

/**
 * The cells of a pair the draft entries don't cover yet — the directions and
 * raw headsigns no configured row renders. Empty when the pair is fully
 * represented, which is when it disappears from the editor's available list.
 */
export function uncoveredPairCells(
  pair: AdminScreenRouteStopInfo,
  entries: ScreenRouteStopComponent[],
): PairCoverageCell[] {
  // The offer space is the pair's served directions only — `directionIds`
  // comes from the same per-direction cards the sign page renders, while
  // `headsignOptions` may also include directions that never render (e.g. an
  // arrival-side direction the stop query filters out).
  const cells: PairCoverageCell[] = [];
  for (const directionId of pair.directionIds) {
    const headsignRows = pair.headsignOptions.filter(
      (option) => option.directionId === directionId,
    );
    if (headsignRows.length > 0) {
      for (const option of headsignRows) {
        cells.push({ directionId, rawHeadsign: option.rawHeadsign });
      }
    } else {
      cells.push({ directionId, rawHeadsign: null });
    }
  }

  // An unscoped entry renders everything the pair serves.
  if (
    entries.some(
      (entry) => entry.directionId === undefined && !entry.headsignFilter,
    )
  ) {
    return [];
  }

  return cells.filter(
    (cell) => !entries.some((entry) => entryCoversCell(entry, cell)),
  );
}

/**
 * Display label for one uncovered cell — the raw headsign a complementary
 * row would show, or the whole direction when the pair carries no headsigns.
 */
export function pairCoverageCellLabel(cell: PairCoverageCell): string {
  return cell.rawHeadsign ?? `direction ${cell.directionId}`;
}
