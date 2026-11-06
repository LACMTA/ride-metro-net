import { useStore } from "@nanostores/react";
import {
  routePredictions,
  predictionsRequestStatus,
} from "../lib/routePredictionsStore";

interface Props {
  routeId: string;
  directionId: number | string;
  /**
   * Optional GTFS stop ID to scope predictions to (e.g. a route card's
   * `childStopId`). When set, only predictions recorded against this stop
   * are shown; otherwise predictions across all polled stops are merged.
   */
  stopId?: string;
}

export default function RoutePrediction({
  routeId,
  directionId,
  stopId,
}: Props) {
  const $routePredictions = useStore(routePredictions);
  const $predictionsRequestStatus = useStore(predictionsRequestStatus);

  const routePred = $routePredictions.find(
    (r) => r.routeId.split("-")[0] === routeId,
  );

  if ($predictionsRequestStatus === "loading") {
    return <>Loading predictions...</>;
  }

  if ($predictionsRequestStatus === "error" || !routePred) {
    return <>No predictions available</>;
  }

  const predictions = routePred.destinations
    .filter((d) => d.directionId === String(directionId))
    .filter((d) => stopId === undefined || d.stopId === stopId)
    .flatMap((d) => d.predictions);

  if (predictions.length === 0) {
    return <p>No predictions available</p>;
  }

  return <>{predictions.map((pred) => pred.min).join(", ")} mins</>;
}
