import { atom } from "nanostores";
import type { AlertStatusMap } from "../pages/api/alert-status";

/** Route-ID prefix → number of currently active alerts. */
export const alertStatus = atom<AlertStatusMap>({});
