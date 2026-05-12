import { atom } from "nanostores";
import type {
  AlertStatusMap,
  AccessibilityAlertStop,
} from "../pages/api/alert-status";

/** Route-ID prefix → number of currently active alerts. */
export const alertStatus = atom<AlertStatusMap>({});

/**
 * Rail/busway stops that have at least one currently active alert with
 * `effect === "ACCESSIBILITY_ISSUE"`, resolved to station ID + name.
 */
export const accessibilityAlertStops = atom<AccessibilityAlertStop[]>([]);

/** Tracks the loading/error state of the alert-status API request. */
export const alertStatusRequestStatus = atom<"loading" | "success" | "error">(
  "loading",
);
