import type { RouteWithInfo } from "../lib/getRouteById";
import LineAlertStatus from "./LineAlertStatus";

interface Props {
  routes: RouteWithInfo[];
}

export default function LineAlertStatusList({ routes }: Props) {
  return (
    <>
      {routes.map((route) => (
        <LineAlertStatus key={route.routeId} route={route} />
      ))}
    </>
  );
}
