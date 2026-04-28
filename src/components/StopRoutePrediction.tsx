import { useStore } from "@nanostores/react";
import { routePredictions } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";
import type { Prediction } from "../pages/api/predictions";
import AlertList from "./AlertList";
import RouteBadge from "./RouteBadge";
import type { ReactNode } from "react";
import ArrowIcon from "./ArrowIcon";
import { isBuswayRoute } from "../lib/routeShortNameOverrides";
import { Card, CardHeader, CardBody } from "./Card";

interface Props {
  routes: StopRoute[];
}

interface DestinationPrediction extends Prediction {
  headsign: string;
}

function RouteTable({
  route,
  $routePredictions,
}: {
  route: StopRoute;
  $routePredictions: ReturnType<typeof useStore<typeof routePredictions>>;
}) {
  const isRailOrBusway = route.routeType !== 3 || isBuswayRoute(route.routeId);

  const predictionsRoute = $routePredictions.find(
    (r) => r.routeId.split("-")[0] === route.routeId,
  );

  // Filter predictions to the specific direction stored at build time.
  const destinations = predictionsRoute?.destinations.filter(
    (d) => Number(d.directionId) === Number(route.directionId),
  );

  // Combine predictions across headsigns
  const allPredictions = destinations
    ?.reduce<DestinationPrediction[]>((result, destination) => {
      const destinationPredictions = destination.predictions.map(
        (prediction) => ({
          headsign: destination.headsign,
          ...prediction,
        }),
      );
      return result.concat(destinationPredictions);
    }, [])
    .sort((a, b) => a.sec - b.sec);

  function HeadsignTd({ children }: { children: ReactNode }) {
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

  const predictionsNotAvailable =
    allPredictions?.length === 0 ||
    ($routePredictions.length > 0 && !predictionsRoute);

  const predictionsTable = allPredictions?.map((prediction, index) => (
    <tr key={index}>
      <HeadsignTd>{prediction.headsign}</HeadsignTd>
      <td className="text-right">
        <b className="text-2xl">{prediction.min}</b> mins
      </td>
    </tr>
  ));

  const exceptionTable = route.headsigns.map((headsign, index) => (
    <tr key={index}>
      <HeadsignTd>{headsign}</HeadsignTd>
      <td className="text-right">
        {predictionsNotAvailable
          ? "No predictions available"
          : "Loading predictions..."}
      </td>
    </tr>
  ));

  return (
    <table className="w-full not-first:mt-4">
      <thead className="text-left text-sm text-gray-600 uppercase">
        <tr>
          <th>
            {route.routeType !== 3
              ? `Direction ${route.directionId}`
              : "Destination"}
          </th>
          <th className="max-w-sm text-right text-nowrap">Arrives in</th>
        </tr>
      </thead>
      <tbody>
        {allPredictions && allPredictions?.length > 0
          ? predictionsTable
          : exceptionTable}
      </tbody>
    </table>
  );
}

export default function StopRoutePrediction({ routes }: Props) {
  const $routePredictions = useStore(routePredictions);

  // All routes in the group share the same route identity — use the first for the header.
  const primaryRoute = routes[0];

  return (
    <Card>
      <CardHeader>
        <RouteBadge
          routeId={primaryRoute.routeId}
          routeType={primaryRoute.routeType}
          name={primaryRoute.routeShortName}
          color={primaryRoute.routeColor}
          textColor={primaryRoute.routeTextColor}
        />
      </CardHeader>
      <CardBody>
        {routes.map((route) => (
          <RouteTable
            key={route.directionId}
            route={route}
            $routePredictions={$routePredictions}
          />
        ))}
      </CardBody>
      <AlertList routeIds={[primaryRoute.routeId]} alertEntityType="Route" />
    </Card>
  );
}
