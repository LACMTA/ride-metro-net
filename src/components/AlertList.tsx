import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import Alert from "./Alert";
import AlertIconColumn from "./AlertIconColumn";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import ChevronIcon from "./ChevronIcon";
import clsx from "clsx";

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
    <Disclosure as="div" className="overflow-hidden rounded-b-xl">
      {({ open }) => (
        <>
          <DisclosureButton className="bg-yellow flex w-full cursor-pointer items-center justify-between px-4 py-5 font-bold">
            <h3 className="flex">
              <AlertIconColumn />
              {alertsCount} Active {pluralAlerts}{" "}
              {alertEntityType ? `for this ${alertEntityType}` : ""}
            </h3>
            <ChevronIcon className={clsx("h-3.5", { "rotate-180": open })} />
          </DisclosureButton>
          <DisclosurePanel className="bg-light-yellow">
            {filteredAlerts.map((alert, index) => (
              <Alert alert={alert} key={index} />
            ))}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );

  return alertsCount > 0 ? list : null;
}
