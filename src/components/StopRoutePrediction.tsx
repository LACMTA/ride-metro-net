import { useStore } from "@nanostores/preact";
import { routePredictions } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";
import type { Prediction } from "../pages/api/predictions";
import AlertList from "./AlertList";
import BusIcon from "./BusIcon";
import type { ComponentChildren } from "preact";
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

  function HeadsignTd({ children }: { children: ComponentChildren }) {
    return (
      <td className="py-3 font-bold">
        <ArrowIcon className="text-bus-local mr-2 inline h-4 align-middle" />
        {children}
      </td>
    );
  }

  const predictionsTable = allPredictions?.map((prediction, index) => (
    <tr key={index}>
      <HeadsignTd>{prediction.headsign}</HeadsignTd>
      <td>{prediction.min} mins</td>
    </tr>
  ));

  const exceptionTable = route.headsigns.map((headsign, index) => (
    <tr key={index}>
      <HeadsignTd>{headsign}</HeadsignTd>
      <td>
        {allPredictions?.length === 0
          ? "No predictions available"
          : "Loading predictions..."}
      </td>
    </tr>
  ));

  const table = (
    <table className="m-4 w-full">
      <thead className="text-left text-sm text-gray-600 uppercase">
        <tr>
          <th>Terminus</th>
          <th className="max-w-sm">Arrives in</th>
        </tr>
      </thead>
      <tbody>
        {allPredictions?.length !== 0 ? predictionsTable : exceptionTable}
      </tbody>
    </table>
  );

  return (
    <li className="bg-background-white mb-5 overflow-hidden rounded-xl">
      <h2 className="text-background-white bg-black px-4 py-4 text-5xl font-bold">
        <BusIcon className="mr-3 inline h-9 align-baseline" />
        {route.routeShortName}
      </h2>
      {table}
      <AlertList routeIds={[route.routeId]} alertEntityType="route" />
    </li>
  );
}
