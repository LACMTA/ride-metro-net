import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useStore } from "@nanostores/react";
import Column from "./Column";
import AlertIcon from "./AlertIcon";
import { alerts } from "../lib/alertsStore";
import { isCurrent } from "../lib/isCurrent";
import Alert from "./Alert";

interface Props {
  routeId: string;
}

export default function LineTabs({ routeId }: Props) {
  const $alerts = useStore(alerts);

  const routeAlerts = $alerts.filter((alert) =>
    alert.informedEntities.some((e) => e.routeId === routeId),
  );

  const activeAlerts = routeAlerts.filter((a) => isCurrent(a));
  const upcomingAlerts = routeAlerts.filter((a) => !isCurrent(a));

  return (
    <Column>
      <TabGroup>
        <TabList className="flex gap-2">
          <Tab
            className={({ selected }) =>
              `cursor-pointer rounded-sm border-2 border-black px-5 py-2 font-bold transition-colors ${
                selected
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
              }`
            }
          >
            Maps &amp; Schedules
          </Tab>
          <Tab
            className={({ selected }) =>
              `cursor-pointer rounded-sm border-2 border-black px-5 py-2 font-bold transition-colors ${
                selected
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
              }`
            }
          >
            Alerts
          </Tab>
        </TabList>
        <TabPanels className="mt-6">
          <TabPanel>Maps &amp; Schedules</TabPanel>
          <TabPanel>
            <h2 className="flex items-center gap-3 text-3xl font-bold">
              <AlertIcon
                className="text-yellow size-10"
                markClassName="text-black"
              />{" "}
              Active Alerts
            </h2>
            {activeAlerts.length > 0 ? (
              activeAlerts.map((alert, index) => (
                <Alert key={index} alert={alert} />
              ))
            ) : (
              <p className="text-gray-600">No active alerts</p>
            )}
            <h2 className="mt-6 flex items-center gap-3 text-3xl font-bold">
              <AlertIcon
                className="text-yellow size-10"
                markClassName="text-black"
              />{" "}
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
