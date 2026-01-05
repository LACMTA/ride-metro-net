import { useStore } from "@nanostores/preact";
import { routePredictions } from "../lib/routePredictionsStore";

interface Props {
  routeId: string;
  directionId: 0 | 1;
}

export default function StopRoutePrediction({ routeId, directionId }: Props) {
  const $routePredictions = useStore(routePredictions);
  const route = $routePredictions.find((route) => route.routeId === routeId);
  const destination = route?.destinations.find(
    // Swiftly returns strings, static GTFS returns numbers
    // TODO: implement zod so we don't have these problems.
    (destination) => Number(destination.directionId) === Number(directionId),
  );
  const predictions = destination?.predictions;
  console.log({ route, predictions, routeId, directionId });
  return (
    <li>
      <h4>
        {route?.routeShortName} to {destination?.headsign}
      </h4>
      <p>
        {"Predictions: "}
        {predictions && predictions.length > 0
          ? predictions.map((prediction) => (
              <span>{prediction.min} mins, </span>
            ))
          : "No predictions available"}
      </p>
    </li>
  );
}
