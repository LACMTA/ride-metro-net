import { Disclosure } from "@headlessui/react";
import { useStore } from "@nanostores/react";
import { accessibilityAlertStops } from "../lib/alertStatusStore";
import { CardDiscolsureButton, CardDisclosurePanel } from "./Card";
import AlertIcon from "./AlertIcon";
import Alert from "./Alert";

/**
 * Renders a list of rail/busway stops that currently have an active
 * accessibility alert. Each stop is an expandable disclosure that reveals
 * the full list of Alert components for that stop.
 */
export default function AccessibilityAlertStopList() {
  const stops = useStore(accessibilityAlertStops);

  if (stops.length === 0) {
    return <p className="p-4">No active accessibility alerts.</p>;
  }

  return (
    <>
      {stops.map((stop) => (
        <Disclosure key={stop.stopId}>
          {({ open }) => (
            <>
              <CardDiscolsureButton open={open}>
                <span className="flex">
                  <AlertIcon
                    className="text-yellow mr-3 inline h-5 shrink"
                    markClassName="text-metro-text"
                  />
                  {stop.stopName}
                </span>
              </CardDiscolsureButton>
              <CardDisclosurePanel className="bg-gray-100">
                {stop.alerts.map((alert, index) => (
                  <Alert
                    key={index}
                    alert={alert}
                    fullWidth={true}
                    showAlertIcon={false}
                  />
                ))}
              </CardDisclosurePanel>
            </>
          )}
        </Disclosure>
      ))}
    </>
  );
}
