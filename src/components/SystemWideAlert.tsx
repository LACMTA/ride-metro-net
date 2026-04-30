import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import Alert from "./Alert";
import Column from "./Column";

export default function SystemWideAlert() {
  const $alerts = useStore(alerts);

  const systemAlert = $alerts.find((alert) =>
    alert.informedEntities.some(
      (entity) => entity.agencyId != null && entity.agencyId !== "",
    ),
  );

  if (!systemAlert) return null;

  return (
    <div className="bg-alert py-4">
      <Column>
        <Alert alert={systemAlert} />;
      </Column>
    </div>
  );
}
