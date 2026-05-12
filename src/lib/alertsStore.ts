import { atom } from "nanostores";
import type { ConciseAlert } from "../pages/api/alerts";

export const alerts = atom<ConciseAlert[]>([]);

/** Tracks the loading/error state of the alerts API request. */
export const alertsRequestStatus = atom<"loading" | "success" | "error">(
  "loading",
);
