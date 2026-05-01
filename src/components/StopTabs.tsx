import { TabGroup, TabPanels, TabPanel } from "@headlessui/react";
import { useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import Column from "./Column";
import { StyledTab, StyledTabList, StyledTabPanelWrapper } from "./StyledTabs";
import AlertList from "./AlertList";
import StopRoutePrediction from "./StopRoutePrediction";
import type { StopRoute } from "../lib/getStopWithRoutes";
import AlertsSection from "./AlertsSection";
import { alerts } from "../lib/alertsStore";

interface Props {
  routes: StopRoute[];
  stopId: string;
  allStopIds?: string[];
}

export default function StopTabs({ routes, stopId, allStopIds }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const $alerts = useStore(alerts);
  const stopIdSet = new Set(allStopIds ?? [stopId]);
  const alertCount = $alerts.filter((alert) =>
    alert.informedEntities.some((e) => e.stopId && stopIdSet.has(e.stopId)),
  ).length;

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
  const hasRail = routes.some((route) => route.routeType !== 3);

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
      <div className="bg-metro-text">
        <Column>
          <StyledTabList>
            <StyledTab>Arrivals</StyledTab>
            <StyledTab badge={alertCount} badgeAlert={alertCount > 0}>
              {hasRail ? "Station Alerts" : "Stop Alerts"}
            </StyledTab>
          </StyledTabList>
        </Column>
      </div>
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
              <AlertsSection stopIds={allStopIds ?? [stopId]} />
            </Column>
          </TabPanel>
        </TabPanels>
      </StyledTabPanelWrapper>
    </TabGroup>
  );
}
