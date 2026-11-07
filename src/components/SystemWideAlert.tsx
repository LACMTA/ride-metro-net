import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import Alert from "./Alert";
import Column from "./Column";

export default function SystemWideAlert() {
  const $alerts = useStore(alerts);

  // An alert is system-wide when it has an informed entity with no route or
  // stop scope. The DB layer stores `agencyId: ""` on every entity (see
  // `toAlert` in getServiceAlerts), so a scope-less entity is the system-wide
  // signal — not a populated agencyId.
  const systemAlert = $alerts.find((alert) =>
    alert.informedEntities.some(
      (entity) => entity.routeId == null && entity.stopId == null,
    ),
  );

  if (!systemAlert) return null;

  return (
    <div className="bg-alert">
      <Column>
        <Alert alert={systemAlert} fullWidth />
      </Column>
    </div>
  );
}
