import { atom } from "nanostores";
import type { RoutePredictions } from "../pages/api/predictions";

export const routePredictions = atom<RoutePredictions[]>([]);

/** Tracks the loading/error state of the predictions API request. */
export const predictionsRequestStatus = atom<"loading" | "success" | "error">(
  "loading",
);
