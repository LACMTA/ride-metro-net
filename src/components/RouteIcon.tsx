import BusIcon from "./BusIcon";
import RailIcon from "./RailIcon";

interface Props {
  routeType: number;
  className?: string;
}

/**
 * Renders the correct mode icon for any route:
 *   - Rail (type !== 3) → RailIcon
 *   - Bus / busway      → BusIcon
 *
 * Note: busway routes (G / J) are GTFS type 3 and therefore use BusIcon,
 * which reflects their physical operation on road infrastructure.
 */
export default function RouteIcon({ routeType, className }: Props) {
  if (routeType !== 3) {
    return <RailIcon className={className} />;
  }
  return <BusIcon className={className} />;
}
