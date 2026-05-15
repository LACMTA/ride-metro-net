import { useStore } from "@nanostores/react";
import { alerts, alertsRequestStatus } from "../lib/alertsStore";

interface Props {
  stopIds: string[];
}

/**
 * Renders a live alert-count badge for use in the stop Alerts tab link.
 * Only appears once the alerts API request has succeeded.
 */
export default function StopAlertsBadge({ stopIds }: Props) {
  const $alerts = useStore(alerts);
  const $alertsRequestStatus = useStore(alertsRequestStatus);

  if ($alertsRequestStatus !== "success") return null;

  const stopIdSet = new Set(stopIds);
  const alertCount = $alerts.filter((alert) =>
    alert.informedEntities.some((e) => e.stopId != null && stopIdSet.has(e.stopId)),
  ).length;

  return (
    <span
      className={`ml-2 inline-block rounded-sm px-1.5 text-black ${
        alertCount > 0 ? "bg-alert" : "bg-gray-300"
      }`}
    >
      {alertCount}
    </span>
  );
}
