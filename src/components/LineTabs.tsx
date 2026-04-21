import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import Column from "./Column";

export default function LineTabs() {
  return (
    <Column>
      <TabGroup>
        <TabList>
          <Tab>Maps & Schedules</Tab>
          <Tab>Alerts</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>Maps & Schedules</TabPanel>
          <TabPanel>Alerts</TabPanel>
        </TabPanels>
      </TabGroup>
    </Column>
  );
}
