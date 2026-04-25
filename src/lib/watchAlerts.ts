import type { ConciseAlert } from "../pages/api/alerts";
import { alerts } from "./alertsStore";

export interface AlertsQuery {
  stopIds: string[];
  routeIds: string[];
  agency: string;
}

async function fetchAlerts(query: AlertsQuery): Promise<ConciseAlert[]> {
  const res = await fetch(
    `/api/alerts?stopId=${query.stopIds.join(",")}&routeId=${query.routeIds.join(",")}&agency=${query.agency}`,
  );
  if (!res.ok) {
    console.error(await res.text());
    return [];
  }
  const data = (await res.json()) as ConciseAlert[];
  console.log("Received alerts:", data);
  return data;
}

async function getAllAlerts(queries: AlertsQuery[]) {
  const results = await Promise.all(queries.map(fetchAlerts));
  alerts.set(results.flat());
}

export default async function watchAlerts(
  queries: AlertsQuery[],
  // 5 minutes
  pollInterval: number = 300000,
) {
  getAllAlerts(queries);
  return setInterval(getAllAlerts, pollInterval, queries);
}
