import { useStore } from "@nanostores/react";
import { alertStatus } from "../lib/alertStatusStore";
import type { RouteWithInfo } from "../lib/getRouteById";
import RouteBadge from "./RouteBadge";

interface Props {
  routes: RouteWithInfo[];
}

export default function BusAlertBadgeList({ routes }: Props) {
  const $alertStatus = useStore(alertStatus);

  return (
    <>
      {routes.map((route) => (
        <RouteBadge
          key={route.routeId}
          routeId={route.routeId}
          routeType={route.routeType}
          name={route.routeShortName}
          href={`/lines/${route.routeShortName}#alerts`}
          altBusColors
          busAlertBadge={($alertStatus[route.routeId] ?? 0) > 0}
          className="mr-3 mb-4"
        />
      ))}
    </>
  );
}
