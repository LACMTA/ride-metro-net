import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import Alert from "./Alert";
import AlertIconColumn from "./AlertIconColumn";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";

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
  const pluralAlerts = alertsCount === 1 ? "Alert" : "Alerts";

  const list = (
    <Disclosure as="div" className="block overflow-hidden rounded-b-xl">
      <DisclosureButton>
        <h3 className="bg-yellow flex px-4 py-5 font-bold">
          <AlertIconColumn />
          {alertsCount} Active {pluralAlerts}{" "}
          {alertEntityType ? `for this ${alertEntityType}` : ""}
        </h3>
      </DisclosureButton>
      <DisclosurePanel className="bg-light-yellow">
        {filteredAlerts.map((alert, index) => (
          <Alert alert={alert} key={index} />
        ))}
      </DisclosurePanel>
    </Disclosure>
  );

  return alertsCount > 0 ? list : null;
}
