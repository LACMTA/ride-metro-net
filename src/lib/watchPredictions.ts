import type { RoutePredictions } from "../pages/api/predictions";
import { routePredictions } from "./routePredictionsStore";

let adjustmentIntervalId: NodeJS.Timeout | null;

async function getPredictions(stopId: string, adjustmentInterval: number) {
  if (adjustmentIntervalId) {
    clearInterval(adjustmentIntervalId);
  }
  const res = await fetch(`/api/predictions?stopId=${stopId}`);
  if (!res.ok) {
    return console.error(await res.text());
  }
  const data = (await res.json()) as RoutePredictions[];
  console.log("Received predictions:", data);
  routePredictions.set(data);
  adjustmentIntervalId = setInterval(
    adjustPredictions,
    adjustmentInterval,
    adjustmentInterval / 1000,
  );
}

// automatically decrement the predictions on some interval.
// should help improve accuracy (and avoid overestimates in particular)
// without needing to increase poll frequency
function adjustPredictions(secondsDelta: number) {
  const allPredictions = routePredictions.get();
  const newPredictions = allPredictions.map((p) => {
    return Object.assign(p, {
      destinations: p.destinations.map((d) => {
        return Object.assign(d, {
          predictions: d.predictions.map((prediction) => {
            const sec = prediction.sec - secondsDelta;
            return Object.assign(prediction, {
              time: prediction.time + secondsDelta,
              sec,
              min:
                sec < 0 ? 0 : Math.floor((prediction.sec - secondsDelta) / 60),
            });
          }),
        });
      }),
    });
  });
  console.log("Updated predictions:", newPredictions);
  routePredictions.set(newPredictions);
}

export default async function watchPredictions(
  stopId: string,
  pollInterval: number = 60000,
  adjustmentInterval: number = 30000,
) {
  getPredictions(stopId, adjustmentInterval);
  return setInterval(getPredictions, pollInterval, stopId, adjustmentInterval);
}
