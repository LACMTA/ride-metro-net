import type { ConciseAlert } from "../pages/api/alerts";
import { alerts, alertsRequestStatus } from "./alertsStore";
import { hydrationGate } from "./hydrationGate";

export interface AlertsQuery {
  stopIds: string[];
  routeIds: string[];
}

async function fetchAlerts(query: AlertsQuery): Promise<ConciseAlert[]> {
  // Only send non-empty filters. Sending `stopId=&routeId=` makes the API
  // treat them as a filter matching the empty string (which matches nothing),
  // whereas omitting them entirely returns all active alerts — including
  // system-wide ones.
  const params = new URLSearchParams();
  if (query.stopIds.length > 0) {
    params.set("stopId", query.stopIds.join(","));
  }
  if (query.routeIds.length > 0) {
    params.set("routeId", query.routeIds.join(","));
  }
  const res = await fetch(`/api/alerts?${params.toString()}`);
  if (!res.ok) {
    console.error(await res.text());
    throw new Error(`Failed to fetch alerts: ${res.status}`);
  }
  const data = (await res.json()) as ConciseAlert[];
  console.log("Received alerts:", data);
  return data;
}

async function getAllAlerts(queries: AlertsQuery[]) {
  // Start all fetches immediately so they run in parallel with hydration.
  const fetchPromise = Promise.all(queries.map(fetchAlerts));
  // Wait for the app to hyrdrate before writing to any stores
  await hydrationGate;
  // Only show the loading state on the first request (when not yet succeeded).
  if (alertsRequestStatus.get() !== "success") {
    alertsRequestStatus.set("loading");
  }
  try {
    const results = await fetchPromise;
    alerts.set(results.flat());
    alertsRequestStatus.set("success");
  } catch (err) {
    console.error("Failed to fetch alerts:", err);
    alertsRequestStatus.set("error");
  }
}

export default async function watchAlerts(
  queries: AlertsQuery[] = [{ stopIds: [], routeIds: [] }],
  // 15 minutes
  pollInterval: number = 900000,
) {
  getAllAlerts(queries);
  return setInterval(getAllAlerts, pollInterval, queries);
}
