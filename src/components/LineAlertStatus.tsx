import { useStore } from "@nanostores/react";
import { alertStatus } from "../lib/alertStatusStore";
import type { RouteWithInfo } from "../lib/getRouteById";
import { getLineSlug } from "../lib/routeShortNameOverrides";
import { CardLinkListItem } from "./Card";
import RouteBadge from "./RouteBadge";
import AlertIcon from "./AlertIcon";

interface Props {
  route: RouteWithInfo;
}

/**
 * Displays a single line row inside the Alerts overview card.
 * Shows the route badge alongside either "Normal Service" (no active alerts)
 * or an alert icon with "X Alert(s)" when the shared alerts atom has entries
 * matching this route.
 */
export default function LineAlertStatus({ route }: Props) {
  const $alertStatus = useStore(alertStatus);

  const alertCount = $alertStatus[route.routeId] ?? 0;

  const slug = getLineSlug(route.routeId);

  return (
    <CardLinkListItem href={`/lines/${slug}#alerts`}>
      <span className="flex items-center gap-3">
        <RouteBadge
          routeId={route.routeId}
          routeType={route.routeType}
          name={route.routeShortName}
          color={route.routeColor}
          textColor={route.routeTextColor}
        />
        {alertCount > 0 ? (
          <>
            <AlertIcon
              className="text-yellow h-5 shrink-0"
              markClassName="text-metro-text"
            />
            <span className="font-bold">
              {alertCount} {alertCount === 1 ? "Alert" : "Alerts"}
            </span>
          </>
        ) : (
          <span className="font-bold">Normal Service</span>
        )}
      </span>
    </CardLinkListItem>
  );
}
