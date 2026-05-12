import { useStore } from "@nanostores/react";
import { routePredictions, predictionsRequestStatus } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";
import type { Prediction } from "../pages/api/predictions";
import AlertList from "./AlertList";
import RouteBadge from "./RouteBadge";
import type { ReactNode } from "react";
import ArrowIcon from "./ArrowIcon";
import { isBuswayRoute } from "../lib/routeShortNameOverrides";
import { Card, CardHeader, CardBody } from "./Card";
import railCardinalDirections from "../data/railCardinalDirections";

interface Props {
  routes: StopRoute[];
}

interface DestinationPrediction extends Prediction {
  headsign: string;
  /** The route this prediction belongs to (needed for badge rendering in merged cards). */
  route: StopRoute;
}

/**
 * Renders one predictions table for a single direction.
 *
 * `routes` may contain more than one StopRoute when multiple rail lines
 * share the same child stop — their predictions are interleaved by time.
 */
function DirectionTable({
  routes,
  $routePredictions,
  $predictionsRequestStatus,
}: {
  routes: StopRoute[];
  $routePredictions: ReturnType<typeof useStore<typeof routePredictions>>;
  $predictionsRequestStatus: ReturnType<typeof useStore<typeof predictionsRequestStatus>>;
}) {
  const directionId = routes[0].directionId;
  const isRailOrBusway =
    routes[0].routeType !== 3 || isBuswayRoute(routes[0].routeId);

  // Gather predictions from every route in this direction and interleave.
  const allPredictions: DestinationPrediction[] = [];

  for (const route of routes) {
    const predictionsRoute = $routePredictions.find(
      (r) => r.routeId.split("-")[0] === route.routeId,
    );

    const destinations = predictionsRoute?.destinations.filter(
      (d) => Number(d.directionId) === Number(route.directionId),
    );

    if (destinations) {
      for (const dest of destinations) {
        for (const prediction of dest.predictions) {
          allPredictions.push({
            headsign: dest.headsign,
            route,
            ...prediction,
          });
        }
      }
    }
  }

  allPredictions.sort((a, b) => a.sec - b.sec);

  function HeadsignTd({
    children,
    route,
  }: {
    children: ReactNode;
    route: StopRoute;
  }) {
    return (
      <td className="mr-auto flex w-full items-center py-3 pr-2 font-bold">
        <span>
          {isRailOrBusway ? (
            <RouteBadge
              routeId={route.routeId}
              routeType={route.routeType}
              name={route.routeShortName}
              color={route.routeColor}
              textColor={route.routeTextColor}
              size="sm"
              className="mr-2 inline align-middle"
            />
          ) : (
            <ArrowIcon className="text-bus-local mr-2 inline h-4 align-middle" />
          )}
        </span>
        {children}
      </td>
    );
  }

  const predictionsNotAvailable = $predictionsRequestStatus === "error";

  const predictionsTable = allPredictions.map((prediction, index) => (
    <tr key={index}>
      <HeadsignTd route={prediction.route}>{prediction.headsign}</HeadsignTd>
      <td className="text-right">
        <b className="text-2xl">{prediction.min}</b> mins
      </td>
    </tr>
  ));

  // Fallback rows: show one row per (route, headsign) pair across all routes
  // in this direction.
  const exceptionRows = routes.flatMap((route) =>
    route.headsigns.map((headsign, i) => (
      <tr key={`${route.routeId}-${i}`}>
        <HeadsignTd route={route}>{headsign}</HeadsignTd>
        <td className="text-right">
          {predictionsNotAvailable
            ? "No predictions available"
            : "Loading predictions..."}
        </td>
      </tr>
    )),
  );

  const getDirectionIndicator = (routes: StopRoute[]) => {
    // Bus
    if (routes[0].routeType === 3) return "Destination";
    const cardinalDirections = routes.reduce(
      (res: string[], route: StopRoute) => {
        if (route.routeId in railCardinalDirections) {
          const direction =
            railCardinalDirections[
              route.routeId as keyof typeof railCardinalDirections
            ][directionId];
          if (!res.includes(direction)) {
            res.push(direction);
          }
        }
        return res;
      },
      [],
    );
    // If we somehow don't match any directions, default to "Destination"
    if (cardinalDirections.length > 0) {
      return cardinalDirections.join("/");
    } else {
      return "Destination";
    }
  };

  return (
    <table className="w-full not-first:mt-4">
      <thead className="text-left text-sm text-gray-600 uppercase">
        <tr>
          <th>{getDirectionIndicator(routes)}</th>
          <th className="max-w-sm text-right text-nowrap">Arrives in</th>
        </tr>
      </thead>
      <tbody>
        {allPredictions.length > 0 ? predictionsTable : exceptionRows}
      </tbody>
    </table>
  );
}

export default function StopRoutePrediction({ routes }: Props) {
  const $routePredictions = useStore(routePredictions);
  const $predictionsRequestStatus = useStore(predictionsRequestStatus);

  // Group the incoming routes by directionId so each direction gets one table.
  const byDirection: StopRoute[][] = routes.reduce((acc, route) => {
    const existing = acc.find((g) => g[0].directionId === route.directionId);
    if (existing) existing.push(route);
    else acc.push([route]);
    return acc;
  }, [] as StopRoute[][]);

  // Collect all unique routeIds for the header badges and alert list.
  const uniqueRoutes = routes.filter(
    (route, index, self) =>
      self.findIndex((r) => r.routeId === route.routeId) === index,
  );

  const allRouteIds = uniqueRoutes.map((r) => r.routeId);

  return (
    <Card>
      <CardHeader>
        {uniqueRoutes.map((route) => (
          <RouteBadge
            key={route.routeId}
            routeId={route.routeId}
            routeType={route.routeType}
            name={route.routeShortName}
            color={route.routeColor}
            textColor={route.routeTextColor}
            className={uniqueRoutes.length > 1 ? "mr-2" : undefined}
          />
        ))}
      </CardHeader>
      <CardBody>
        {byDirection.map((dirRoutes) => (
          <DirectionTable
            key={dirRoutes[0].directionId}
            routes={dirRoutes}
            $routePredictions={$routePredictions}
            $predictionsRequestStatus={$predictionsRequestStatus}
          />
        ))}
      </CardBody>
      <AlertList
        routeIds={allRouteIds}
        alertEntityType="line"
        excludeAccessibility
      />
    </Card>
  );
}
