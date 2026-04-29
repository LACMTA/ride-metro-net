import { TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useStore } from "@nanostores/react";
import { useState, useEffect } from "react";
import Column from "./Column";
import AlertIcon from "./AlertIcon";
import { alerts } from "../lib/alertsStore";
import { isCurrent } from "../lib/isCurrent";
import Alert from "./Alert";
import StyledTab from "./StyledTab";

interface Props {
  routeId: string;
}

export default function LineTabs({ routeId }: Props) {
  const $alerts = useStore(alerts);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove the '#' character
    if (hash === "alerts") {
      setSelectedIndex(1);
    } else if (hash === "schedules") {
      setSelectedIndex(0);
    }
  }, []);

  useEffect(() => {
    const hash = selectedIndex === 1 ? "alerts" : "schedules";
    if (window.location.hash.slice(1) !== hash) {
      history.replaceState(null, "", `#${hash}`);
    }
  }, [selectedIndex]);

  const routeAlerts = $alerts.filter((alert) =>
    alert.informedEntities.some((e) => e.routeId === routeId),
  );

  const activeAlerts = routeAlerts.filter((a) => isCurrent(a));
  const upcomingAlerts = routeAlerts.filter((a) => !isCurrent(a));

  return (
    <Column>
      <TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex}>
        <TabList className="flex gap-2">
          <StyledTab>Maps &amp; Schedules</StyledTab>
          <StyledTab>Alerts</StyledTab>
        </TabList>
        <TabPanels className="mt-6 mb-10">
          <TabPanel>Maps &amp; Schedules</TabPanel>
          <TabPanel>
            <h2 className="mt-8 mb-4 flex items-center gap-3 text-3xl font-bold">
              <AlertIcon
                className="text-yellow size-10"
                markClassName="text-black"
              />
              Active Alerts
            </h2>
            {activeAlerts.length > 0 ? (
              activeAlerts.map((alert, index) => (
                <Alert key={index} alert={alert} />
              ))
            ) : (
              <p className="text-gray-600">No active alerts</p>
            )}
            <h2 className="mt-8 mb-4 flex items-center gap-3 text-3xl font-bold">
              <AlertIcon
                className="text-yellow size-10"
                markClassName="text-black"
              />
              Upcoming Alerts
            </h2>
            {upcomingAlerts.length > 0 ? (
              upcomingAlerts.map((alert, index) => (
                <Alert key={index} alert={alert} />
              ))
            ) : (
              <p className="text-gray-600">No upcoming alerts</p>
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </Column>
  );
}
