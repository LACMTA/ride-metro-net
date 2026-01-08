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

export default async function watchPredictions(
  stopId: string,
  pollInterval: number = 15000,
) {
  const curriedGetPredictions = getPredictions.bind(null, stopId);
  curriedGetPredictions();
  return setInterval(curriedGetPredictions, pollInterval);
}
