import { useStore } from "@nanostores/preact";
import { routePredictions } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";
import type { Prediction } from "../pages/api/predictions";
import AlertList from "./AlertList";

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

  const destinations = predictionsRoute?.destinations;

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
    <li>
      <h4>{route.routeShortName}</h4>
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
      <AlertList routeIds={[route.routeId]} />
    </li>
  );
}
