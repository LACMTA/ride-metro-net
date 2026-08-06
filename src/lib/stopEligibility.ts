import { getAgencyIdsByFlag } from "./agencies";

/**
 * Shared SQL condition + bind params that identify routes from agencies
 * where `buildStopPages` is enabled and whose `route_long_name` is non-empty.
 *
 * Used by both `getStopStaticPaths` (built stop pages) and the `bus-stops`
 * API (system map) so that the set of stops shown on the map stays 1-1 with
 * the set of stops that have generated pages.
 *
 * @param routeAlias - The SQL alias/column reference for `route_id`, e.g. `"r.route_id"`.
 * @returns `{ clause, params }` — `clause` is a SQL fragment with `?`
 *   placeholders; `params` are the bind values (agency IDs) in order.
 */
export function buildStopPagesRouteCondition(routeAlias: string): {
  clause: string;
  params: string[];
} {
  const agencyIds = getAgencyIdsByFlag("buildStopPages");
  const placeholders = agencyIds.map(() => "?").join(",");
  const clause = `${routeAlias}.agency_id IN (${placeholders})
        AND ${routeAlias}.route_long_name IS NOT NULL
        AND ${routeAlias}.route_long_name != ''`;
  return { clause, params: agencyIds };
}
