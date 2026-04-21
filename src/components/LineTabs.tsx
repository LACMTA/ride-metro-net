import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import Button from "./Button";
import Column from "./Column";

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
        <TabPanels>
          <TabPanel>Maps &amp; Schedules</TabPanel>
          <TabPanel>Alerts</TabPanel>
        </TabPanels>
      </TabGroup>
    </Column>
  );
}
