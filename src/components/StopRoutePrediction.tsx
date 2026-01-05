import { useStore } from "@nanostores/preact";
import { routePredictions } from "../lib/routePredictionsStore";
import type { StopRoute } from "../lib/getStopWithRoutes";

interface Props {
  route: StopRoute;
}

export default function StopRoutePrediction({ route }: Props) {
  const $routePredictions = useStore(routePredictions);

  const predictionsRoute = $routePredictions.find(
    (r) => r.routeId === route.routeId,
  );

  // TODO: this is leading to showing headsigns we aren't getting predictions for (ex: 5133)
  // Should we remove headsigns that don't have predictions once we get live data?
  // It seems like there may be a number of cases to handle.
  const destinations = predictionsRoute?.destinations;

  return (
    <li>
      <h4>{route.routeShortName}</h4>
      {route.headsigns.map((headsign, index) => (
        <p key={index}>
          <b>{headsign}</b>:{" "}
          {destinations
            ?.find((d) => d.headsign === headsign)
            ?.predictions.map((prediction, predIndex) => (
              <span key={predIndex}>{prediction.min} mins, </span>
            )) || "Loading predictions..."}
        </p>
      ))}
    </li>
  );
}
