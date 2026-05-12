import { TabGroup, TabPanels, TabPanel } from "@headlessui/react";
import { useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import Column from "./Column";
import { StyledTab, StyledTabList, StyledTabPanelWrapper } from "./StyledTabs";
import AlertsSection from "./AlertsSection";
import LineOverview from "./LineOverview";
import { alerts, alertsRequestStatus } from "../lib/alertsStore";
import type { RouteOverview } from "../lib/getRouteOverview";

interface Props {
  routeId: string;
  lineTitle: string;
  routeOverview: RouteOverview;
  pdfUrl: string;
  routeType: number;
}

export default function LineTabs({
  routeId,
  lineTitle,
  pdfUrl,
  routeOverview,
  routeType,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const $alerts = useStore(alerts);
  const $alertsRequestStatus = useStore(alertsRequestStatus);
  const alertCount = $alerts.filter(
    (alert) =>
      alert.effect !== "ACCESSIBILITY_ISSUE" &&
      alert.informedEntities.some((e) => e.routeId === routeId),
  ).length;

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
      <div className="bg-metro-text">
        <Column>
          <StyledTabList>
            <StyledTab>Maps &amp; Schedules</StyledTab>
            <StyledTab
              badge={$alertsRequestStatus === "success" ? alertCount : undefined}
              badgeAlert={$alertsRequestStatus === "success" && alertCount > 0}
            >
              Alerts
            </StyledTab>
          </StyledTabList>
        </Column>
      </div>
      <StyledTabPanelWrapper>
        <Column>
          <TabPanels>
            <TabPanel>
              <LineOverview lineTitle={lineTitle} routeOverview={routeOverview} pdfUrl={pdfUrl} routeType={routeType} />
            </TabPanel>
            <TabPanel>
              <AlertsSection routeId={routeId} />
            </TabPanel>
          </TabPanels>
        </Column>
      </StyledTabPanelWrapper>
    </TabGroup>
  );
}
