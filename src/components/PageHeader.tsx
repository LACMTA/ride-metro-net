import Column from "./Column";
import RailIcon from "./RailIcon";
import BusIcon from "./BusIcon";
import RouteBadge, { type BadgeSizes } from "./RouteBadge";
import { getLineSlug } from "../lib/routeShortNameOverrides";

interface Route {
  routeId: string;
  routeType: number;
  routeShortName: string;
  routeColor?: string;
  routeTextColor?: string;
}

interface Props {
  routes: Route[];
  title: string;
  badgeSize?: BadgeSizes;
}

/**
 * Shared page header used by both line and stop detail pages.
 *
 * Renders (inside a Column):
 *   - A RailIcon when any route is a rail mode (routeType !== 3)
 *   - A BusIcon  when any route is a bus/busway mode (routeType === 3)
 *   - A deduplicated, numerically-sorted list of RouteBadges
 *   - An <h1> with the supplied title
 */
export default function PageHeader({ routes, title, badgeSize = "lg" }: Props) {
  const uniqueSortedRoutes = routes
    .filter(
      (route, index, self) =>
        self.findIndex((r) => r.routeId === route.routeId) === index,
    )
    .sort((a, b) =>
      (a.routeShortName ?? "").localeCompare(
        b.routeShortName ?? "",
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
    );

  return (
    <div className="bg-metro-text border-t border-gray-800 pt-12 pb-8 text-white">
      <Column>
        <div className="flex items-center">
          <ul className="mb-2">
            {uniqueSortedRoutes.map((route) => (
              <li key={route.routeId} className="my-1 mr-2 inline-block">
                <RouteBadge
                  routeId={route.routeId}
                  routeType={route.routeType}
                  name={route.routeShortName}
                  color={route.routeColor}
                  textColor={route.routeTextColor}
                  size={badgeSize}
                  href={`/lines/${getLineSlug(route.routeId)}`}
                />
              </li>
            ))}
          </ul>
        </div>
        <h1 className="text-4xl font-bold">{title}</h1>
      </Column>
    </div>
  );
}
