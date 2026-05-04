import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import { analyticsEvent } from "../lib/analytics";
import { isCurrent } from "../lib/isCurrent";
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
  includeUpcoming?: boolean;
  excludeAccessibility?: boolean;
}

export default function AlertList({
  stopIds,
  routeIds,
  alertEntityType,
  includeUpcoming = false,
  excludeAccessibility = false,
}: Props) {
  const $alerts = useStore(alerts);

  const filteredAlerts = $alerts.filter((alert) => {
    const matchesEntity = alert.informedEntities.find((entity) => {
      return (
        stopIds?.includes(entity.stopId || "") ||
        routeIds?.includes(entity.routeId || "")
      );
    });

    if (!matchesEntity) return false;

    if (!includeUpcoming && !isCurrent(alert)) return false;

    if (excludeAccessibility && alert.effect === "ACCESSIBILITY_ISSUE")
      return false;

    return true;
  });

  const alertsCount = filteredAlerts.length;
  const pluralAlerts = alertsCount === 1 ? "alert" : "alerts";

  const list = (
    <Disclosure as="div" className="overflow-hidden rounded-b-xl">
      <DisclosureButton
        className="bg-yellow group analytics-alert-accordion flex w-full cursor-pointer items-center justify-between px-4 py-5 font-bold"
        onClick={() =>
          analyticsEvent({ event: "click", target: "alert_accordion" })
        }
      >
        <span className="flex">
          <AlertIconColumn />
          {alertsCount}
          {includeUpcoming ? "" : " current"} {pluralAlerts}{" "}
          {alertEntityType ? `for this ${alertEntityType}` : ""}
        </span>
        <ChevronIcon className="h-3.5 group-data-open:rotate-180" />
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
