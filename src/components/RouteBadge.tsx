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
}: Props) {
  const mode = getRouteMode(routeId, routeType);

  const shapeClass =
    mode === "bus"
      ? "px-3 rounded-lg"
      : `w-8 ${mode === "rail" ? "rounded-full" : ""}`;
  const colorClass = mode === "bus" ? "bg-bus-local text-background-white" : "";
  const colorStyle =
    mode !== "bus"
      ? { backgroundColor: `#${color}`, color: `#${textColor}` }
      : undefined;
  const ariaLabel =
    mode === "bus"
      ? `line ${name} bus`
      : `${name} line ${mode === "busway" ? "busway" : "train"}`;

  const className = `inline-flex h-8 items-center justify-center text-xl font-bold ${shapeClass} ${colorClass}`.trim();

  if (href) {
    return (
      <a
        href={href}
        className={className}
        style={colorStyle}
        aria-label={ariaLabel}
      >
        {name}
      </a>
    );
  }

  return (
    <span
      className={className}
      style={colorStyle}
      aria-label={ariaLabel}
    >
      {name}
    </span>
  );
}
