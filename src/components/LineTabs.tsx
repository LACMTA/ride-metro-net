import { TabGroup, TabPanels, TabPanel } from "@headlessui/react";
import { useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import Column from "./Column";
import { StyledTab, StyledTabList, StyledTabPanelWrapper } from "./StyledTabs";
import AlertsSection from "./AlertsSection";
import { alerts } from "../lib/alertsStore";
import Button from "./Button";
import DownloadIcon from "./DownloadIcon";
import type { RouteOverview } from "../lib/getRouteOverview";
import MapPinIcon from "./MapPinIcon";
import ClockIcon from "./ClockIcon";
import { formatGTFSTime } from "../lib/formatGTFSTime";

interface Props {
  routeId: string;
  lineTitle: string;
  routeOverview: RouteOverview;
  pdfUrl: string;
}

export default function LineTabs({
  routeId,
  lineTitle,
  pdfUrl,
  routeOverview,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const $alerts = useStore(alerts);
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
            <StyledTab badge={alertCount} badgeAlert={alertCount > 0}>
              Alerts
            </StyledTab>
          </StyledTabList>
        </Column>
      </div>
      <StyledTabPanelWrapper>
        <Column>
          <TabPanels>
            <TabPanel>
              <div className="pt-5 pb-50">
                <h2 className="mb-6 text-2xl font-bold">
                  {lineTitle} Overview
                </h2>
                <div className="flex">
                  <MapPinIcon
                    aria-hidden="true"
                    className="mr-3 inline h-6 w-6"
                  />
                  <p>
                    Busses run from{" "}
                    <a
                      href={`/stops/${routeOverview.firstStopId}`}
                      className="text-blue underline"
                    >
                      {routeOverview.firstStopName}
                    </a>
                    {" to "}
                    <a
                      href={`/stops/${routeOverview.lastStopId}`}
                      className="text-blue underline"
                    >
                      {routeOverview.lastStopName}
                    </a>{" "}
                    with {routeOverview.stopCount} stops between.
                  </p>
                </div>
                {routeOverview.weekday.first &&
                  routeOverview.weekday.last &&
                  routeOverview.weekend.first &&
                  routeOverview.weekend.last && (
                    <div className="mt-6 mb-10 flex">
                      <ClockIcon
                        aria-hidden="true"
                        className="mr-3 inline h-6 w-6"
                      />
                      <div>
                        <p>
                          <b>Monday through Friday</b>
                          <br />
                          Busses run between{" "}
                          {formatGTFSTime(routeOverview.weekday.first)} and{" "}
                          {formatGTFSTime(routeOverview.weekday.last)}
                        </p>
                        <p className="mt-1">
                          <b>Saturdays, Sundays, and Holidays</b>
                          <br />
                          Busses run between{" "}
                          {formatGTFSTime(routeOverview.weekday.first)} and{" "}
                          {formatGTFSTime(routeOverview.weekday.last)}
                        </p>
                      </div>
                    </div>
                  )}

                <h2 className="mb-4 text-2xl font-bold">{lineTitle} Details</h2>
                <p className="mb-4">
                  Find stop times, maps, and more in the document below.
                </p>
                <Button
                  as="a"
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Schedule and Map{" "}
                  <DownloadIcon
                    className="inline text-white"
                    aria-hidden="true"
                  />
                </Button>
              </div>
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
