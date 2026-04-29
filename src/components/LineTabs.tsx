import { TabGroup, TabPanels, TabPanel } from "@headlessui/react";
import { useState, useEffect } from "react";
import Column from "./Column";
import { StyledTab, StyledTabList, StyledTabPanelWrapper } from "./StyledTabs";
import AlertsSection from "./AlertsSection";

interface Props {
  routeId: string;
}

export default function LineTabs({ routeId }: Props) {
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

  return (
    <TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex}>
      <Column>
        <StyledTabList>
          <StyledTab>Maps &amp; Schedules</StyledTab>
          <StyledTab>Alerts</StyledTab>
        </StyledTabList>
      </Column>
      <StyledTabPanelWrapper>
        <Column>
          <TabPanels>
            <TabPanel>Maps &amp; Schedules</TabPanel>
            <TabPanel>
              <AlertsSection routeId={routeId} />
            </TabPanel>
          </TabPanels>
        </Column>
      </StyledTabPanelWrapper>
    </TabGroup>
  );
}
