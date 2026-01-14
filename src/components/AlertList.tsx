import { useStore } from "@nanostores/preact";
import { alerts } from "../lib/alertsStore";
import Alert from "./Alert";

interface Props {
  stopIds?: string[];
  routeIds?: string[];
  alertEntityType?: string;
}

export default function AlertList({
  stopIds,
  routeIds,
  alertEntityType,
}: Props) {
  const $alerts = useStore(alerts);

  const filteredAlerts = $alerts.filter((alert) =>
    alert.informedEntities.find((entity) => {
      return (
        stopIds?.includes(entity.stopId || "") ||
        routeIds?.includes(entity.routeId || "")
      );
    }),
  );

  const alertsCount = filteredAlerts.length;
  const pluralAlerts = alertsCount === 1 ? "alert" : "alerts";

  const list = (
    <ul>
      <h3>
        {alertsCount} active {pluralAlerts}{" "}
        {alertEntityType ? `for this ${alertEntityType}` : ""}
      </h3>
      {filteredAlerts.map((alert) => (
        <li>
          <Alert alert={alert} />
        </li>
      ))}
    </ul>
  );

  return alertsCount > 0 ? list : null;
}
