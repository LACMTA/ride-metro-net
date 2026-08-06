import AlertIcon from "./AlertIcon";
import { getBadgeStyle, badgeSizes, type BadgeSizes } from "../lib/badgeStyles";

export type { BadgeSizes };

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

/**
 * Renders the correct badge for any route:
 *   - Rail (type !== 3)  → circular badge, GTFS inline color
 *   - Busway (G / J)     → square badge (no radius), GTFS inline color
 *   - Regular bus        → pill badge, fixed brand colors
 *
 * Styling logic (shape, colors, aria-label) is shared with map popups via
 * {@link getBadgeStyle} in `src/lib/badgeStyles.ts`.
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
  const {
    className: allClassName,
    inlineStyle,
    ariaLabel,
  } = getBadgeStyle({
    routeId,
    routeType,
    name,
    color,
    textColor,
    size,
    altBusColors,
    busAlertBadge,
    className,
  });

  const s = badgeSizes[size];

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
        style={inlineStyle ?? undefined}
        aria-label={ariaLabel}
      >
        {name}
        {alertIcon}
      </a>
    );
  }

  return (
    <span
      className={allClassName}
      style={inlineStyle ?? undefined}
      aria-label={ariaLabel}
    >
      {name}
      {alertIcon}
    </span>
  );
}
