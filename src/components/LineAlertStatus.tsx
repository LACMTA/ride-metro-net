import { useStore } from "@nanostores/react";
import { alerts } from "../lib/alertsStore";
import type { RouteWithInfo } from "../lib/getRouteById";
import { isCurrent } from "../lib/isCurrent";
import { ROUTE_SHORT_NAME_OVERRIDES } from "../lib/routeShortNameOverrides";
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
  const $alerts = useStore(alerts);

  const alertCount = $alerts.filter(
    (alert) =>
      isCurrent(alert) &&
      alert.informedEntities.some((entity) => entity.routeId === route.routeId),
  ).length;

  // Derive the URL slug — lettered routes (A–K) use the lowercase letter,
  // all others use the numeric prefix directly.
  const letter = ROUTE_SHORT_NAME_OVERRIDES[route.routeId];
  const slug = letter ? letter.toLowerCase() : route.routeId;

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
            <AlertIcon className="text-yellow h-5 shrink-0" />
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
