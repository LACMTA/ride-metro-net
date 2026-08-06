/**
 * Shared badge styling logic used by both `RouteBadge.tsx` (React) and
 * map popup HTML builders (plain string). Keeping the shape/color/aria
 * decisions in one place ensures visual consistency across the site.
 */
import { isBuswayRoute } from "./routeShortNameOverrides";

export type BadgeSizes = "sm" | "md" | "lg" | "xl";

export type RouteMode = "rail" | "busway" | "bus";

export function getRouteMode(routeId: string, routeType: number): RouteMode {
  if (routeType !== 3) return "rail";
  if (isBuswayRoute(routeId)) return "busway";
  return "bus";
}

interface SizeConfig {
  h: string;
  w: string;
  px: string;
  pxAlert: string;
  text: string;
  alert: string;
  minW: string;
}

export const badgeSizes: Record<BadgeSizes, SizeConfig> = {
  sm: {
    h: "h-6",
    w: "w-6",
    px: "px-2",
    pxAlert: "pr-1.5",
    text: "text-base",
    alert: "h-4",
    minW: "min-w-12",
  },
  md: {
    h: "h-8",
    w: "w-8",
    px: "px-3",
    pxAlert: "pr-2",
    text: "text-xl",
    alert: "h-5",
    minW: "min-w-16",
  },
  lg: {
    h: "h-10",
    w: "w-10",
    px: "px-4",
    pxAlert: "pr-2.5",
    text: "text-2xl",
    alert: "h-6",
    minW: "min-w-20",
  },
  xl: {
    h: "h-14",
    w: "w-14",
    px: "px-5",
    pxAlert: "pr-3",
    text: "text-4xl",
    alert: "h-8",
    minW: "min-w-28",
  },
};

export interface BadgeStyleInput {
  routeId: string;
  routeType: number;
  /** Display name (route short name, e.g. "720", "A"). */
  name: string;
  /** GTFS route_color — hex string without the leading '#' (e.g. "0072BC"). */
  color?: string;
  /** GTFS route_text_color — hex string without the leading '#'. */
  textColor?: string;
  /** Size variant. Defaults to "md". */
  size?: BadgeSizes;
  /** Use alternative presentation for bus badges. */
  altBusColors?: boolean;
  /** Show alert badge padding (affects bus shape only). */
  busAlertBadge?: boolean;
  /** Extra className to append. */
  className?: string;
}

export interface BadgeStyleResult {
  /** Tailwind class string for the badge element. */
  className: string;
  /** Inline style object (for React) or null if no inline styles needed. */
  inlineStyle: Record<string, string> | null;
  /** Accessible label for the badge. */
  ariaLabel: string;
}

/**
 * Computes the className, inline style, and aria-label for a route badge.
 * Used by `RouteBadge.tsx` for React rendering and by `buildBadgeHtml()`
 * for plain-HTML map popups — ensuring both paths produce visually
 * identical badges.
 */
export function getBadgeStyle(input: BadgeStyleInput): BadgeStyleResult {
  const {
    routeId,
    routeType,
    color,
    textColor,
    size = "md",
    altBusColors = false,
    busAlertBadge = false,
    className: extraClassName = "",
  } = input;

  const mode = getRouteMode(routeId, routeType);
  const s = badgeSizes[size];

  const shapeClass =
    mode === "bus"
      ? `${s.minW} ${s.px} ${busAlertBadge && s.pxAlert} rounded-lg`
      : `${s.w} ${mode === "rail" ? "rounded-full" : ""}`;
  const busColorClass = altBusColors
    ? "bg-gray-100 text-metro-text border-gray-300 border"
    : "bg-bus-local text-background-white";
  const colorClass = mode === "bus" ? busColorClass : "";
  const inlineStyle =
    mode !== "bus" && color
      ? {
          "background-color": `#${color}`,
          color: `#${textColor ?? "FFFFFF"}`,
        }
      : null;
  const ariaLabel =
    mode === "bus"
      ? `line ${input.name} bus`
      : `${input.name} line ${mode === "busway" ? "busway" : "train"}`;

  const allClassName =
    `inline-flex ${s.h} shrink-0 items-center justify-center ${s.text} ${!altBusColors && "font-bold"} ${shapeClass} ${colorClass} ${extraClassName}`.trim();

  return { className: allClassName, inlineStyle, ariaLabel };
}

/**
 * Builds a plain-HTML string for a route badge, suitable for MapLibre
 * popups (which require HTML strings, not React elements).
 *
 * Uses the same {@link getBadgeStyle} logic as `RouteBadge.tsx`, so
 * badges look identical on the map and on regular pages.
 *
 * @param input - Route info and styling options (includes `name`).
 * @returns HTML string like `<span class="..." style="...">720</span>`.
 */
export function buildBadgeHtml(input: BadgeStyleInput): string {
  const { className, inlineStyle, ariaLabel } = getBadgeStyle(input);
  const styleStr = inlineStyle
    ? Object.entries(inlineStyle)
        .map(([k, v]) => `${k}:${v}`)
        .join(";")
    : "";
  const styleAttr = styleStr ? ` style="${styleStr}"` : "";
  return `<span class="${className}"${styleAttr} aria-label="${ariaLabel}">${input.name}</span>`;
}
