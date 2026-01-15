import { useStore } from "@nanostores/preact";
import { routePredictions } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";
import type { Prediction } from "../pages/api/predictions";
import AlertList from "./AlertList";
import BusIcon from "./BusIcon";

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

  return (
    <li className="overflow-hidden rounded-xl">
      <h2 className="text-background-white bg-black px-4 py-4 text-5xl font-bold">
        <BusIcon className="mr-3 inline h-10 align-baseline" />
        {route.routeShortName}
      </h2>
      {allPredictions?.map((prediction, index) => (
        <p key={index}>
          <b>{prediction.headsign}</b>: {prediction.min} mins
        </p>
      )) ||
        route.headsigns.map((headsign, index) => (
          <p key={index}>
            <b>{headsign}</b>: Loading predictions...
          </p>
        ))}
      <AlertList routeIds={[route.routeId]} alertEntityType="route" />
    </li>
  );
}
