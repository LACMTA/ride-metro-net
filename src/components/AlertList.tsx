import { useStore } from "@nanostores/preact";
import { alerts } from "../lib/alertsStore";

interface Props {
  stopIds?: string[];
  routeIds?: string[];
}

export default function AlertList({ stopIds, routeIds }: Props) {
  const $alerts = useStore(alerts);

  const filteredAlerts = $alerts.filter((alert) =>
    alert.informedEntities.find((entity) => {
      return (
        stopIds?.includes(entity.stopId || "") ||
        routeIds?.includes(entity.routeId || "")
      );
    }),
  );

  return (
    <ul>
      {filteredAlerts.map((alert) => (
        <li>
          <pre>{JSON.stringify(alert, null, 2)}</pre>
        </li>
      ))}
    </ul>
  );
}
