import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import Column from "./Column";
import AlertIcon from "./AlertIcon";

export default function LineTabs() {
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
            <h2 className="flex items-center gap-3 text-3xl font-bold">
              <AlertIcon
                className="text-yellow size-10"
                markClassName="text-black"
              />{" "}
              Upcoming Alerts
            </h2>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </Column>
  );
}
