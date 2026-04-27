import AlertIcon from "./AlertIcon";
import { isBuswayRoute } from "../lib/routeShortNameOverrides";

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
}

type RouteMode = "rail" | "busway" | "bus";

function getRouteMode(routeId: string, routeType: number): RouteMode {
  if (routeType !== 3) return "rail";
  if (isBuswayRoute(routeId)) return "busway";
  return "bus";
}

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
}: Props) {
  const mode = getRouteMode(routeId, routeType);

  const shapeClass =
    mode === "bus"
      ? `px-3 ${busAlertBadge && "pr-2"} rounded-lg`
      : `w-8 ${mode === "rail" ? "rounded-full" : ""}`;
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
    `inline-flex h-8 items-center justify-center text-xl ${!altBusColors && "font-bold"} ${shapeClass} ${colorClass} ${className}`.trim();

  const alertIcon = busAlertBadge && (
    <AlertIcon
      className="text-alert ml-1.5 h-5"
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
