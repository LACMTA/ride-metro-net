import { useStore } from "@nanostores/react";
import { alerts, alertsRequestStatus } from "../lib/alertsStore";

interface Props {
  routeId: string;
}

/**
 * Renders a live alert-count badge for use in the line Alerts tab link.
 * Only appears once the alerts API request has succeeded.
 */
export default function LineAlertsBadge({ routeId }: Props) {
  const $alerts = useStore(alerts);
  const $alertsRequestStatus = useStore(alertsRequestStatus);

  if ($alertsRequestStatus !== "success") return null;

  const alertCount = $alerts.filter(
    (alert) =>
      alert.effect !== "ACCESSIBILITY_ISSUE" &&
      alert.informedEntities.some((e) => e.routeId === routeId),
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
