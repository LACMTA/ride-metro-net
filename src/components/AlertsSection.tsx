import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import { isCurrent } from "../lib/isCurrent";
import Alert from "./Alert";
import AlertIcon from "./AlertIcon";
import { Card, CardBody, CardHeader } from "./Card";

interface Props {
  routeId?: string;
  stopId?: string;
  stopIds?: string[];
}

export default function AlertsSection({ routeId, stopId, stopIds }: Props) {
  const $alerts = useStore(alerts);
  const stopIdSet = new Set(stopIds ?? (stopId ? [stopId] : []));

  const filteredAlerts = $alerts.filter((alert) =>
    alert.informedEntities.some((e) => {
      if (routeId) return e.routeId === routeId;
      if (stopIdSet.size > 0)
        return e.stopId != null && stopIdSet.has(e.stopId);
      return false;
    }),
  );

  const activeAlerts = filteredAlerts.filter((a) => isCurrent(a));
  const upcomingAlerts = filteredAlerts.filter((a) => !isCurrent(a));

  return (
    <div>
      <Card>
        <CardHeader background="white" className="flex items-center gap-3">
          <AlertIcon
            className="text-yellow size-10"
            markClassName="text-black"
          />
          Active Alerts
        </CardHeader>
        <CardBody margin={false}>
          {activeAlerts.length > 0 ? (
            activeAlerts.map((alert, index) => (
              <Alert key={index} alert={alert} showAlertIcon={false} />
            ))
          ) : (
            <p className="p-4 text-gray-600">No active alerts</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader background="white" className="flex items-center gap-3">
          <AlertIcon
            className="text-yellow size-10"
            markClassName="text-black"
          />
          Upcoming Alerts
        </CardHeader>
        <CardBody margin={false}>
          {upcomingAlerts.length > 0 ? (
            upcomingAlerts.map((alert, index) => (
              <Alert key={index} alert={alert} showAlertIcon={false} />
            ))
          ) : (
            <p className="p-4 text-gray-600">No upcoming alerts</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
