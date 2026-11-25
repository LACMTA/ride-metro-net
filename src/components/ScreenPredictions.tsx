import { useStore } from "@nanostores/react";
import {
  routePredictions,
  predictionsRequestStatus,
} from "../lib/routePredictionsStore";
import { matchesHeadsignFilter } from "../lib/screenLayout";

interface Props {
  routeId: string;
  directionId: number | string;
  /**
   * Optional GTFS stop ID to scope predictions to (e.g. a route card's
   * `childStopId`). When set, only predictions recorded against this stop
   * are shown; otherwise predictions across all polled stops are merged.
   */
  stopId?: string;
  /**
   * Optional: only show arrivals whose raw GTFS stop_headsign contains this
   * substring (case-insensitive). Split-line routes run two lines under one
   * GTFS route ID, distinguishable only by the raw headsign's prefix
   * ("48 - Avalon Station" vs "10 - Downtown LA - 7th - Hill") — sign rows
   * use this to show each sub-line's arrivals separately.
   */
  headsignFilter?: string;
}

export default function RoutePrediction({
  routeId,
  directionId,
  stopId,
  headsignFilter,
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

  const filter = headsignFilter?.trim() ?? "";
  // Each destination's predictions are time-sorted by the API, but a row can
  // match several destinations (a direction with multiple headsigns, a
  // split-line filter matching several raw headsigns, …), and flat-mapping
  // concatenates their per-destination arrays without a global order —
  // sort the merged list by absolute arrival time so countdowns ascend.
  const predictions = routePred.destinations
    .filter((d) => d.directionId === String(directionId))
    .filter((d) => stopId === undefined || d.stopId === stopId)
    .filter((d) => matchesHeadsignFilter(filter, d.rawHeadsign))
    .flatMap((d) => d.predictions)
    .sort((a, b) => a.time - b.time);

  if (predictions.length === 0) {
    return <p>No predictions available</p>;
  }

  return <>{predictions.map((pred) => pred.min).join(", ")} mins</>;
}
