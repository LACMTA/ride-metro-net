import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import Button from "./Button";
import Column from "./Column";
import AlertIcon from "./AlertIcon";

export default function LineTabs() {
  return (
    <Column>
      <TabGroup>
        <TabList className="flex gap-2">
          <Tab>
            {({ selected }) => (
              <Button selected={selected}>Maps &amp; Schedules</Button>
            )}
          </Tab>
          <Tab>
            {({ selected }) => <Button selected={selected}>Alerts</Button>}
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
