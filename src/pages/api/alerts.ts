import type { Alert } from "gtfs-types";
import type { CamelCasedPropertiesDeep } from "type-fest";

export const prerender = false;

type CamelCaseAlert = CamelCasedPropertiesDeep<Alert>;

// Swiftly uses `informedEntities` instead of `informedEntity` as in the spec (their docs have it right; the API does not)
// and also has a number of non-spec fields in the response, many of which we want to scrub before passing on.
type SwiftlyAlert = CamelCaseAlert & {
  informedEntities: CamelCaseAlert["informedEntity"];
  agencyId: string;
  createdAt: string;
  userEmail: string;
  userFullname: string;
  deletedAt?: string;
  deletedBy?: string;
};
type AlertsApiResponse = SwiftlyAlert[];

export type ConciseAlert = Pick<
  SwiftlyAlert,
  | "activePeriod"
  | "headerText"
  | "descriptionText"
  | "effect"
  | "cause"
  | "informedEntities"
>;

/**
 * GET /api/alerts
 * @param {string} [stopId] - Comma-separated list of stop IDs to filter by
 * @param {string} [routeId] - Comma-separated list of route IDs to filter by
 * @returns {ConciseAlert[]} Array of alerts
 */
export async function GET(context: import("astro").APIContext) {
  const API_KEY = import.meta.env.API_KEY;
  const stopIds = context.url.searchParams.get("stopId")?.split(",") || [];
  const routeIds = context.url.searchParams.get("routeId")?.split(",") || [];

  // TODO: generalize for trains
  const AGENCY_KEY = "lametro";

  const alertsUrl = new URL(
    `https://api.goswift.ly/real-time/${AGENCY_KEY}/gtfs-rt-alerts/v2`,
  );
  // TODO: consider using protocol buffer for network performance
  // it's possible the response will actually match the GTFS spec in this case
  alertsUrl.searchParams.append("format", "json");

  // TODO: consider caching alerts
  const alertsResponsePromise = fetch(alertsUrl.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: API_KEY as string,
    },
  });

  const alertsResponse = await alertsResponsePromise;
  if (!alertsResponse.ok) {
    console.error(await alertsResponse.text());
    return new Response(`Swifty request failed!`, {
      status: 500,
    });
  }

  const alertsData: AlertsApiResponse = await alertsResponse.json();

  const makeConciseAlert = (fullAlert: SwiftlyAlert) => {
    const conciseAlert: ConciseAlert = {
      activePeriod: fullAlert.activePeriod,
      headerText: fullAlert.headerText,
      descriptionText: fullAlert.descriptionText,
      effect: fullAlert.effect,
      cause: fullAlert.cause,
      informedEntities: fullAlert.informedEntities,
    };
    return conciseAlert;
  };

  const filteredAlerts = alertsData.reduce<ConciseAlert[]>(
    (result, alert, index) => {
      stopIds.forEach((stopId) => {
        if (alert.informedEntities.find((entity) => entity.stopId === stopId)) {
          result.push(makeConciseAlert(alert));
          // return so we don't duplicate if both the stop and route are found
          return result;
        }
      });
      routeIds.forEach((routeId) => {
        if (
          alert.informedEntities.find((entity) => entity.routeId === routeId)
        ) {
          result.push(makeConciseAlert(alert));
        }
      });
      return result;
    },
    [],
  );

  return new Response(JSON.stringify(filteredAlerts));
}
