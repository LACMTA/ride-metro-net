import type { AlertStatusResponse } from "../pages/api/alert-status";
import {
  alertStatus,
  accessibilityAlertStops,
  alertStatusRequestStatus,
} from "./alertStatusStore";

async function fetchAlertStatus(): Promise<void> {
  // Only show the loading state on the first request (when not yet succeeded).
  if (alertStatusRequestStatus.get() !== "success") {
    alertStatusRequestStatus.set("loading");
  }
  const res = await fetch("/api/alert-status");
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
