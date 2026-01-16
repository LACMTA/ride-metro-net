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
    <div>
      <h3 className="bg-yellow p-4 font-bold">
        {alertsCount} active {pluralAlerts}{" "}
        {alertEntityType ? `for this ${alertEntityType}` : ""}
      </h3>
      <div className="bg-light-yellow p-4">
        {filteredAlerts.map((alert) => (
          <Alert alert={alert} />
        ))}
      </div>
    </div>
  );

  return alertsCount > 0 ? list : null;
}
