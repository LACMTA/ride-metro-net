import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import { isCurrent } from "../lib/isCurrent";
import Alert from "./Alert";
import AlertIcon from "./AlertIcon";

interface Props {
  routeId?: string;
  stopId?: string;
}

export default function AlertsSection({ routeId, stopId }: Props) {
  const $alerts = useStore(alerts);

  const filteredAlerts = $alerts.filter((alert) =>
    alert.informedEntities.some((e) => {
      if (routeId) return e.routeId === routeId;
      if (stopId) return e.stopId === stopId;
      return false;
    }),
  );

  const activeAlerts = filteredAlerts.filter((a) => isCurrent(a));
  const upcomingAlerts = filteredAlerts.filter((a) => !isCurrent(a));

  return (
    <div>
      <h2 className="mt-8 mb-4 flex items-center gap-3 text-3xl font-bold">
        <AlertIcon className="text-yellow size-10" markClassName="text-black" />
        Active Alerts
      </h2>
      {activeAlerts.length > 0 ? (
        activeAlerts.map((alert, index) => <Alert key={index} alert={alert} />)
      ) : (
        <p className="text-gray-600">No active alerts</p>
      )}
      <h2 className="mt-8 mb-4 flex items-center gap-3 text-3xl font-bold">
        <AlertIcon className="text-yellow size-10" markClassName="text-black" />
        Upcoming Alerts
      </h2>
      {upcomingAlerts.length > 0 ? (
        upcomingAlerts.map((alert, index) => (
          <Alert key={index} alert={alert} />
        ))
      ) : (
        <p className="text-gray-600">No upcoming alerts</p>
      )}
    </div>
  );
}
