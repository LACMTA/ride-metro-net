import type { AlertStatusMap } from "../pages/api/alert-status";
import { alertStatus } from "./alertStatusStore";

async function fetchAlertStatus(): Promise<void> {
  const res = await fetch("/api/alert-status");
  if (!res.ok) {
    console.error("Failed to fetch alert status:", await res.text());
    return;
  }
  const data = (await res.json()) as AlertStatusMap;
  console.log("Received alerts status", data);
  alertStatus.set(data);
}

export default function watchAlertStatus(
  /** Polling interval in ms (default 5 minutes). */
  pollInterval: number = 300_000,
) {
  fetchAlertStatus();
  return setInterval(fetchAlertStatus, pollInterval);
}
