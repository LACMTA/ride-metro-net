import { TabGroup, TabPanels, TabPanel } from "@headlessui/react";
import { useState, useEffect } from "react";
import Column from "./Column";
import { StyledTab, StyledTabList, StyledTabPanelWrapper } from "./StyledTabs";
import AlertList from "./AlertList";
import StopRoutePrediction from "./StopRoutePrediction";
import type { StopRoute } from "../lib/getStopWithRoutes";
import AlertsSection from "./AlertsSection";

interface Props {
  routes: StopRoute[];
  stopId: string;
}

export default function StopTabs({ routes, stopId }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "alerts") {
      setSelectedIndex(1);
    } else if (hash === "arrivals") {
      setSelectedIndex(0);
    }
  }, []);

  useEffect(() => {
    const hash = selectedIndex === 1 ? "alerts" : "arrivals";
    if (window.location.hash.slice(1) !== hash) {
      history.replaceState(null, "", `#${hash}`);
    }
  }, [selectedIndex]);

  // Group routes so they share a single Card:
  //   • Rail routes: group by childStopId — lines sharing the same
  //     platform (child stop) are merged into one card with
  //     interleaved predictions.
  //   • Bus routes: group by routeId.
  const grouped: StopRoute[][] = routes.reduce((acc, route) => {
    const isRail = route.routeType !== 3;
    const existing = acc.find((g) =>
      isRail
        ? g[0].routeType !== 3 && g[0].childStopId === route.childStopId
        : g[0].routeId === route.routeId,
    );
    if (existing) existing.push(route);
    else acc.push([route]);
    return acc;
  }, [] as StopRoute[][]);

  return (
    <TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex}>
      <Column>
        <StyledTabList>
          <StyledTab>Arrivals</StyledTab>
          <StyledTab>Alerts</StyledTab>
        </StyledTabList>
      </Column>
      <StyledTabPanelWrapper>
        <TabPanels>
          <TabPanel>
            <div className="py-3">
              <Column>
                {grouped.map((groupedRoutes, index) => (
                  <StopRoutePrediction key={index} routes={groupedRoutes} />
                ))}
              </Column>
            </div>
          </TabPanel>
          <TabPanel>
            <Column>
              <AlertsSection stopId={stopId} />
            </Column>
          </TabPanel>
        </TabPanels>
      </StyledTabPanelWrapper>
    </TabGroup>
  );
}
