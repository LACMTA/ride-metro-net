import type { RoutePredictions } from "../pages/api/predictions";
import {
  routePredictions,
  predictionsRequestStatus,
} from "./routePredictionsStore";
import { hydrationGate } from "./hydrationGate";

let adjustmentIntervalId: NodeJS.Timeout | null;

async function getPredictions(
  stopIds: string[],
  agency: string,
  adjustmentInterval: number,
) {
  if (adjustmentIntervalId) {
    clearInterval(adjustmentIntervalId);
  }
  // Start the fetch immediately so it runs in parallel with hydration.
  const fetchPromise = fetch(
    `/api/predictions?stopId=${stopIds.join(",")}&agency=${agency}`,
  );
  // Wait for the app to hyrdrate before writing to any stores
  await hydrationGate;
  // Only show the loading state on the first request (when not yet succeeded).
  if (predictionsRequestStatus.get() !== "success") {
    predictionsRequestStatus.set("loading");
  }
  try {
    const res = await fetchPromise;
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as RoutePredictions[];
    console.log("Received predictions:", data);
    routePredictions.set(data);
    predictionsRequestStatus.set("success");
    adjustmentIntervalId = setInterval(
      adjustPredictions,
      adjustmentInterval,
      adjustmentInterval / 1000,
    );
  } catch (err) {
    console.error("Failed to fetch predictions:", err);
    predictionsRequestStatus.set("error");
  }
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
  stopIds: string[],
  agency: string,
  pollInterval: number = 60000,
  adjustmentInterval: number = 30000,
) {
  getPredictions(stopIds, agency, adjustmentInterval);
  return setInterval(
    getPredictions,
    pollInterval,
    stopIds,
    agency,
    adjustmentInterval,
  );
}
