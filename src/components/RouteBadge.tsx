import AlertIcon from "./AlertIcon";
import { isBuswayRoute } from "../lib/routeShortNameOverrides";

export type BadgeSizes = "sm" | "md" | "lg" | "xl";

interface Props {
  routeId: string;
  routeType: number;
  name: string;
  /** GTFS route_color — hex string without the leading '#' (e.g. "0072BC"). Not required for bus routes (routeType === 3). */
  color?: string;
  /** GTFS route_text_color — hex string without the leading '#' (e.g. "FFFFFF"). Not required for bus routes (routeType === 3). */
  textColor?: string;
  /** Optional URL — when provided the badge renders as an `<a>` element. */
  href?: string;
  /** Optional className for overrides */
  className?: string;
  /** Optional: use the alternative presentation for bus badges */
  altBusColors?: boolean;
  /** Optional: show an alert badge after the route name */
  busAlertBadge?: boolean;
  /** Optional size variant. Defaults to "md". */
  size?: BadgeSizes;
}

type RouteMode = "rail" | "busway" | "bus";

function getRouteMode(routeId: string, routeType: number): RouteMode {
  if (routeType !== 3) return "rail";
  if (isBuswayRoute(routeId)) return "busway";
  return "bus";
}

const sizes = {
  sm: {
    h: "h-6",
    w: "w-6",
    px: "px-2",
    pxAlert: "pr-1.5",
    text: "text-base",
    alert: "h-4",
  },
  md: {
    h: "h-8",
    w: "w-8",
    px: "px-3",
    pxAlert: "pr-2",
    text: "text-xl",
    alert: "h-5",
  },
  lg: {
    h: "h-10",
    w: "w-10",
    px: "px-4",
    pxAlert: "pr-2.5",
    text: "text-2xl",
    alert: "h-6",
  },
  xl: {
    h: "h-14",
    w: "w-14",
    px: "px-5",
    pxAlert: "pr-3",
    text: "text-4xl",
    alert: "h-8",
  },
} as const;

/**
 * Renders the correct badge for any route:
 *   - Rail (type !== 3)  → circular badge, GTFS inline color
 *   - Busway (G / J)     → square badge (no radius), GTFS inline color
 *   - Regular bus        → pill badge, fixed brand colors
 */
export default function RouteBadge({
  routeId,
  routeType,
  name,
  color,
  textColor,
  href,
  className,
  altBusColors = false,
  busAlertBadge = false,
  size = "md",
}: Props) {
  const mode = getRouteMode(routeId, routeType);
  const s = sizes[size];

  const shapeClass =
    mode === "bus"
      ? `${s.px} ${busAlertBadge && s.pxAlert} rounded-lg`
      : `${s.w} ${mode === "rail" ? "rounded-full" : ""}`;
  const busColorClass = altBusColors
    ? "bg-background-gray text-metro-text border-metro-text border"
    : "bg-bus-local text-background-white";
  const colorClass = mode === "bus" ? busColorClass : "";
  const colorStyle =
    mode !== "bus"
      ? { backgroundColor: `#${color}`, color: `#${textColor}` }
      : undefined;
  const ariaLabel =
    mode === "bus"
      ? `line ${name} bus`
      : `${name} line ${mode === "busway" ? "busway" : "train"}`;

  const allClassName =
    `inline-flex ${s.h} items-center justify-center ${s.text} ${!altBusColors && "font-bold"} ${shapeClass} ${colorClass} ${className}`.trim();

  const alertIcon = busAlertBadge && (
    <AlertIcon
      className={`text-alert ml-1.5 ${s.alert}`}
      markClassName="text-metro-text"
    />
  );

  if (href) {
    return (
      <a
        href={href}
        className={allClassName}
        style={colorStyle}
        aria-label={ariaLabel}
      >
        {name}
        {alertIcon}
      </a>
    );
  }

  return (
    <span className={allClassName} style={colorStyle} aria-label={ariaLabel}>
      {name}
      {alertIcon}
    </span>
  );
}
