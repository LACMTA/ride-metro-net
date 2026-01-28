import { useStore } from "@nanostores/react";
import { routePredictions } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";
import type { Prediction } from "../pages/api/predictions";
import AlertList from "./AlertList";
import BusIcon from "./BusIcon";
import type { ReactNode } from "react";
import ArrowIcon from "./ArrowIcon";

interface Props {
  route: StopRoute;
}

interface DestinationPrediction extends Prediction {
  headsign: string;
}

export default function StopRoutePrediction({ route }: Props) {
  const $routePredictions = useStore(routePredictions);

  const predictionsRoute = $routePredictions.find(
    (r) => r.routeId === route.routeId,
  );

  const destinations = predictionsRoute?.destinations.filter(
    (d) => Number(d.directionId) === Number(route.directionId),
  );

  // Combine predictions across headsigns
  const allPredictions = destinations
    ?.reduce<DestinationPrediction[]>((result, destination, index) => {
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
      <td className="mr-auto flex w-full py-3 pr-2 font-bold">
        <span>
          <ArrowIcon className="text-bus-local mr-2 inline h-4 align-middle" />
        </span>
        {children}
      </td>
    );
  }

  const predictionsTable = allPredictions?.map((prediction, index) => (
    <tr key={index}>
      <HeadsignTd>{prediction.headsign}</HeadsignTd>
      <td className="text-right">
        <b className="text-2xl">{prediction.min}</b> mins
      </td>
    </tr>
  ));

  const predictionsNotAvailable =
    allPredictions?.length === 0 ||
    ($routePredictions.length > 0 && !predictionsRoute);

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

  const table = (
    <table className="w-full">
      <thead className="text-left text-sm text-gray-600 uppercase">
        <tr>
          <th>Destination</th>
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

  return (
    <div className="bg-background-white mb-5 overflow-hidden rounded-xl">
      <h2 className="text-background-white bg-black p-4 text-5xl font-bold">
        <BusIcon className="mr-3 inline h-9 align-baseline" />
        {route.routeShortName}
      </h2>
      <div className="m-4">{table}</div>
      <AlertList routeIds={[route.routeId]} alertEntityType="Route" />
    </div>
  );
}
