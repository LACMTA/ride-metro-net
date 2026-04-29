import Column from "./Column";
import RailIcon from "./RailIcon";
import BusIcon from "./BusIcon";
import RouteBadge from "./RouteBadge";

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
export default function PageHeader({ routes, title }: Props) {
  const hasRail = routes.some((r) => r.routeType !== 3);
  const hasBus = routes.some((r) => r.routeType === 3);

  const uniqueSortedRoutes = routes
    .filter(
      (route, index, self) =>
        self.findIndex((r) => r.routeId === route.routeId) === index,
    )
    .sort((a, b) =>
      (a.routeShortName ?? "").localeCompare(b.routeShortName ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  return (
    <Column>
      <div className="mt-6 mb-4 flex items-center">
        {hasRail && <RailIcon className="text-metro-text mr-4 h-8 shrink-0" />}
        {hasBus && <BusIcon className="text-metro-text mr-4 h-8 shrink-0" />}
        <ul>
          {uniqueSortedRoutes.map((route) => (
            <li key={route.routeId} className="my-1 mr-1.5 inline-block">
              <RouteBadge
                routeId={route.routeId}
                routeType={route.routeType}
                name={route.routeShortName}
                color={route.routeColor}
                textColor={route.routeTextColor}
              />
            </li>
          ))}
        </ul>
      </div>
      <h1 className="mb-4 text-4xl font-bold">{title}</h1>
    </Column>
  );
}
