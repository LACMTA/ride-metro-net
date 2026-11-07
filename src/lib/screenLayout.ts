/**
 * Shared layout math for the pixel-dimensioned arrival-board screens
 * (`/screens/[signId]`).
 *
 * A sign renders a fixed-size board of exactly its configured `dimensions`,
 * so pagination is computed deterministically at build time from fixed
 * per-component pixel heights: the sign page applies these constants as
 * inline element heights (`src/components/ScreenItem.astro`) and packs the
 * paginated render items into pages with `packIntoPages`. The admin screens
 * editor imports the same module to estimate rows-per-page while editing.
 *
 * Pure TypeScript — no server-only imports. The `getStopWithRoutes` import
 * below is type-only, so it is erased and never reaches the client bundle.
 */
import type {
  DisplayOrderEntry,
  ScreenDimensions,
  ScreenSignConfig,
} from "../data/types";
import type { StopRoute } from "./getStopWithRoutes";

/**
 * Fixed pixel heights of each sign element, matching the markup in
 * `src/components/ScreenItem.astro`: route rows are their former 96px
 * content + 32px padding + 4px border; headers keep their former
 * padding-based height; the dots bar is reserved at the bottom of every
 * board so the page-capacity math is stable whether or not the sign
 * actually paginates.
 */
export const SCREEN_ROW_HEIGHTS = {
  /** One route row (badge + headsigns + prediction). */
  route: 132,
  /** One header row. */
  header: 96,
  /** The pagination dots bar at the bottom of the board. */
  dotsBar: 40,
} as const;

/** Target dimensions used when a sign omits `dimensions`. */
export const DEFAULT_SCREEN_DIMENSIONS: ScreenDimensions = {
  width: 1920,
  height: 1080,
};

/** Page-flip interval used when a sign omits `pagination.intervalMs`. */
export const DEFAULT_PAGINATION_INTERVAL_MS = 10_000;

/** Validation bounds, enforced by `validateScreenConfigBody`. */
export const SCREEN_DIMENSIONS_MIN = 200;
export const SCREEN_DIMENSIONS_MAX = 16_384;
export const PAGINATION_INTERVAL_MIN_MS = 1_000;
export const PAGINATION_INTERVAL_MAX_MS = 600_000;

/** One resolved render item on a sign — a section heading or a route card. */
export type ScreenRenderItem =
  | { type: "header"; text: string }
  | { type: "route"; route: StopRoute };

/** How much vertical space an item occupies, and whether it is a heading. */
export interface ScreenItemMeasure {
  height: number;
  isHeader: boolean;
}

/** Measures a resolved render item (used by the sign page's page packing). */
export function measureScreenRenderItem(
  item: ScreenRenderItem,
): ScreenItemMeasure {
  return item.type === "header"
    ? { height: SCREEN_ROW_HEIGHTS.header, isHeader: true }
    : { height: SCREEN_ROW_HEIGHTS.route, isHeader: false };
}

/**
 * Measures a raw displayOrder entry for the admin editor's rows-per-page
 * estimate. Approximate: an entry without `directionId` may expand into
 * multiple route cards at build time (one per served direction).
 */
export function measureDisplayOrderEntry(
  entry: DisplayOrderEntry,
): ScreenItemMeasure {
  return entry.component === "header"
    ? { height: SCREEN_ROW_HEIGHTS.header, isHeader: true }
    : { height: SCREEN_ROW_HEIGHTS.route, isHeader: false };
}

/** A sign's configured dimensions, defaulting to 1920×1080. */
export function resolveScreenDimensions(
  config: ScreenSignConfig,
): ScreenDimensions {
  return config.dimensions ?? DEFAULT_SCREEN_DIMENSIONS;
}

/** A sign's page-flip interval, defaulting and clamping to sane bounds. */
export function resolvePaginationIntervalMs(config: ScreenSignConfig): number {
  const raw = config.pagination?.intervalMs ?? DEFAULT_PAGINATION_INTERVAL_MS;
  return Math.min(
    PAGINATION_INTERVAL_MAX_MS,
    Math.max(PAGINATION_INTERVAL_MIN_MS, raw),
  );
}

/**
 * Height available for paginated rows: the board height minus the fixed
 * components' total height and the always-reserved dots bar.
 */
export function paginatedAreaHeight(
  dimensions: ScreenDimensions,
  fixedItemsHeight: number,
): number {
  return Math.max(
    0,
    dimensions.height - fixedItemsHeight - SCREEN_ROW_HEIGHTS.dotsBar,
  );
}

/**
 * Splits items into pages that fit `availableHeight` px, in order. Greedy
 * fill with one rule: a page never ends on a heading — trailing headers
 * roll to the next page so a heading always has rows beneath it. A single
 * item taller than `availableHeight` still gets its own page, so a
 * degenerate tiny screen shows one item per page instead of looping forever.
 */
export function packIntoPages<T>(
  items: T[],
  availableHeight: number,
  measure: (item: T) => ScreenItemMeasure,
): T[][] {
  const pages: T[][] = [];
  let current: T[] = [];

  const pageHeight = (page: T[]): number =>
    page.reduce((sum, item) => sum + measure(item).height, 0);

  const closePage = () => {
    // Carry trailing headers to the next page, keeping at least one item
    // so a closed page is never empty.
    const carried: T[] = [];
    while (
      current.length > 1 &&
      measure(current[current.length - 1]).isHeader
    ) {
      carried.unshift(current.pop()!);
    }
    pages.push(current);
    current = carried;
  };

  for (const item of items) {
    if (
      current.length > 0 &&
      pageHeight(current) + measure(item).height > availableHeight
    ) {
      closePage();
    }
    current.push(item);
  }
  if (current.length > 0) pages.push(current);

  return pages;
}
