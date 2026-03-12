import type { ConciseAlert } from "../pages/api/alerts";
import { alerts } from "./alertsStore";

async function getAlerts(
  stopIds: string[],
  routeIds: string[],
  agency: string,
) {
  const res = await fetch(
    `/api/alerts?stopId=${stopIds.join(",")}&routeId=${routeIds.join(",")}&agency=${agency}`,
  );
  if (!res.ok) {
    return console.error(await res.text());
  }
  const data = (await res.json()) as ConciseAlert[];
  console.log("Received alerts:", data);
  alerts.set(data);
}

export default async function watchAlerts(
  stopIds: string[],
  routeIds: string[],
  agency: string,
  // 5 minutes
  pollInterval: number = 300000,
) {
  getAlerts(stopIds, routeIds, agency);
  return setInterval(getAlerts, pollInterval, stopIds, routeIds, agency);
}
