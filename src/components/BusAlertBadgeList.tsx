import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { useStore } from "@nanostores/react";
import { alertStatus } from "../lib/alertStatusStore";
import type { RouteWithInfo } from "../lib/getRouteById";
import ChevronIcon from "./ChevronIcon";
import RouteBadge from "./RouteBadge";
import { CardDisclosurePanel, CardDiscolsureButton } from "./Card";

interface Props {
  routes: RouteWithInfo[];
}

const GROUP_LABELS: Record<string, string> = {
  "0-99": "Lines 0–99",
  "100-199": "Lines 100–199",
  "200-299": "Lines 200–299",
  "300+": "Lines 300+",
};

const GROUP_ORDER = ["0-99", "100-199", "200-299", "300+"];

function getGroup(routeShortName: string): string {
  const n = parseInt(routeShortName, 10);
  if (isNaN(n)) return "0-99";
  if (n < 100) return "0-99";
  if (n < 200) return "100-199";
  if (n < 300) return "200-299";
  return "300+";
}

export default function BusAlertBadgeList({ routes }: Props) {
  const $alertStatus = useStore(alertStatus);

  const grouped = GROUP_ORDER.reduce<Record<string, RouteWithInfo[]>>(
    (acc, key) => {
      acc[key] = [];
      return acc;
    },
    {},
  );

  for (const route of routes) {
    grouped[getGroup(route.routeShortName)].push(route);
  }

  return (
    <div className="flex-wrap">
      {GROUP_ORDER.map((group) => {
        const groupRoutes = grouped[group];
        if (groupRoutes.length === 0) return null;
        return (
          <Disclosure key={group}>
            {({ open }) => (
              <>
                <CardDiscolsureButton open={open}>
                  {GROUP_LABELS[group]}
                </CardDiscolsureButton>
                <CardDisclosurePanel>
                  <div>
                    {groupRoutes.map((route) => (
                      <RouteBadge
                        key={route.routeId}
                        routeId={route.routeId}
                        routeType={route.routeType}
                        name={route.routeShortName}
                        href={`/lines/${route.routeId}#alerts`}
                        altBusColors
                        busAlertBadge={($alertStatus[route.routeId] ?? 0) > 0}
                        className="mr-3 mb-4"
                      />
                    ))}
                  </div>
                </CardDisclosurePanel>
              </>
            )}
          </Disclosure>
        );
      })}
    </div>
  );
}
