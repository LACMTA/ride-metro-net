import type { RoutePredictions } from "../pages/api/predictions";
import { routePredictions } from "./routePredictionsStore";

async function getPredictions(stopId: string) {
  const res = await fetch(`/api/predictions?stopId=${stopId}`);
  if (!res.ok) {
    return console.error(await res.text());
  }
  const data = (await res.json()) as RoutePredictions[];
  console.log("Received predictions:", data);
  routePredictions.set(data);
}

function adjustPredictions(secondsDelta: number) {
  const allPredictions = routePredictions.get();
  const newPredictions = allPredictions.map((p) => {
    return Object.assign(p, {
      destinations: p.destinations.map((d) => {
        return Object.assign(d, {
          predictions: d.predictions.map((prediction) => {
            return Object.assign(prediction, {
              time: prediction.time + secondsDelta,
              sec: prediction.sec - secondsDelta,
              min: Math.floor((prediction.sec - secondsDelta) / 60),
            });
          }),
        });
      }),
    });
  });
  console.log("Updated predictions", newPredictions);
  routePredictions.set(newPredictions);
}

export default async function watchPredictions(
  stopId: string,
  pollInterval: number = 60000,
  adjustmentInterval: number = 10000,
) {
  const curriedGetPredictions = getPredictions.bind(null, stopId);
  const curriedadjustPredictions = adjustPredictions.bind(
    null,
    adjustmentInterval / 1000,
  );
  curriedGetPredictions();
  setInterval(curriedadjustPredictions, adjustmentInterval);
  return setInterval(curriedGetPredictions, pollInterval);
}
