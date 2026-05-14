import type { AlertStatusResponse } from "../pages/api/alert-status";
import {
  alertStatus,
  accessibilityAlertStops,
  alertStatusRequestStatus,
} from "./alertStatusStore";
import { hydrationGate } from "./hydrationGate";

async function fetchAlertStatus(): Promise<void> {
  // Start the fetch immediately so it runs in parallel with hydration.
  const fetchPromise = fetch("/api/alert-status");
  // Wait for the app to hyrdrate before writing to any stores
  await hydrationGate;
  // Only show the loading state on the first request (when not yet succeeded).
  if (alertStatusRequestStatus.get() !== "success") {
    alertStatusRequestStatus.set("loading");
  }
  const res = await fetchPromise;
  if (!res.ok) {
    console.error("Failed to fetch alert status:", await res.text());
    alertStatusRequestStatus.set("error");
    return;
  }
  const data = (await res.json()) as AlertStatusResponse;
  console.log("Received alerts status", data);
  alertStatus.set(data.routeAlertCounts);
  accessibilityAlertStops.set(data.accessibilityAlertStops);
  alertStatusRequestStatus.set("success");
}

export default function watchAlertStatus(
  /** Polling interval in ms (default 15 minutes). */
  pollInterval: number = 900_000,
) {
  fetchAlertStatus();
  return setInterval(fetchAlertStatus, pollInterval);
}
