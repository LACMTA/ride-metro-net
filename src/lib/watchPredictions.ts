import type { RoutePredictions } from "../pages/api/predictions";
import {
  routePredictions,
  predictionsRequestStatus,
} from "./routePredictionsStore";
import { hydrationGate } from "./hydrationGate";

let adjustmentIntervalId: NodeJS.Timeout | null;

/**
 * Recompute `sec` and `min` for every prediction from its absolute `time`
 * (Unix epoch seconds) and the current wall clock. This keeps countdowns
 * accurate regardless of when the server response was cached.
 */
function computeFromTime(predictions: RoutePredictions[]): RoutePredictions[] {
  const nowSec = Math.floor(Date.now() / 1000);
  return predictions.map((route) => ({
    ...route,
    destinations: route.destinations.map((dest) => ({
      ...dest,
      predictions: dest.predictions.map((p) => {
        const sec = Math.max(0, p.time - nowSec);
        return { ...p, sec, min: Math.floor(sec / 60) };
      }),
    })),
  }));
}

async function getPredictions(stopIds: string[], adjustmentInterval: number) {
  if (adjustmentIntervalId) {
    clearInterval(adjustmentIntervalId);
  }
  // Start the fetch immediately so it runs in parallel with hydration.
  const fetchPromise = fetch(`/api/predictions?stopId=${stopIds.join(",")}`);
  // Wait for the app to hydrate before writing to any stores
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
    // Immediately derive accurate min/sec from absolute arrival timestamps.
    routePredictions.set(computeFromTime(data));
    predictionsRequestStatus.set("success");
    // Keep ticking so the countdown stays accurate between polls.
    adjustmentIntervalId = setInterval(adjustPredictions, adjustmentInterval);
  } catch (err) {
    console.error("Failed to fetch predictions:", err);
    predictionsRequestStatus.set("error");
  }
}

// Recompute min/sec from the absolute arrival timestamp on each tick.
function adjustPredictions() {
  routePredictions.set(computeFromTime(routePredictions.get()));
}

export default async function watchPredictions(
  stopIds: string[],
  pollInterval: number = 60000,
  adjustmentInterval: number = 1000,
) {
  getPredictions(stopIds, adjustmentInterval);
  return setInterval(getPredictions, pollInterval, stopIds, adjustmentInterval);
}
