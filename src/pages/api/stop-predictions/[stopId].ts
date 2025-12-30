import type { Alert, Incrementality } from "gtfs-types";
import type { CamelCasedPropertiesDeep, OverrideProperties } from "type-fest";

export const prerender = false;

type PredictionsApiResponse = {
  data: {
    agencyKey: string;
    predictionsData: Predictions;
  };
  route: string;
  success: boolean;
};

export type Predictions = {
  destinations: {
    directionId: string;
    headsign: string;
    predictions: {
      min: number;
      sec: number;
      time: number;
      tripId: string;
      vehicleId: string;
    }[];
  }[];
  routeId: string;
  routeName: string;
  routeShortName: string;
  stopCode: number;
  stopId: string;
  stopName: string;
}[];

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

type AlertsResponse = {
  stopAlerts: ConciseAlert[];
  routeAlerts: {
    [routeId: string]: ConciseAlert[];
  };
};

export type StopPredictionsWithAlerts = {
  predictions: Predictions;
  alerts: AlertsResponse;
};

export async function GET(context: import("astro").APIContext) {
  const { env } = context.locals.runtime;
  const { stopId } = context.params;

  if (!stopId) return new Response("Stop ID is required", { status: 400 });

  // TODO: generalize for trains
  const AGENCY_KEY = "lametro";

  const predictionsUrl = new URL(
    `https://api.goswift.ly/real-time/${AGENCY_KEY}/predictions`,
  );
  predictionsUrl.searchParams.append("stop", stopId);

  const predictionsResponse = await fetch(predictionsUrl.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: env.API_KEY as string,
    },
  });
  if (!predictionsResponse.ok) {
    console.error(await predictionsResponse.text());
    return new Response(`Swifty request failed!`, {
      status: 500,
    });
  }

  const predictionsData: PredictionsApiResponse =
    await predictionsResponse.json();
  const filteredPredictions = predictionsData.data.predictionsData;

  const routeIds = filteredPredictions.map((route) => route.routeId);

  const alertsUrl = new URL(
    `https://api.goswift.ly/real-time/${AGENCY_KEY}/gtfs-rt-alerts/v2`,
  );
  // TODO: consider using protocol buffer for network performance
  alertsUrl.searchParams.append("format", "json");

  // TODO: run fetches concurrently
  // TODO: consider caching alerts with KV (if we stay on cloudflare)
  const alertsResponse = await fetch(alertsUrl.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: env.API_KEY as string,
    },
  });
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

  const filteredAlerts = alertsData.reduce<AlertsResponse>(
    (result, alert, index) => {
      if (alert.informedEntities.find((entity) => entity.stopId === stopId)) {
        result.stopAlerts.push(makeConciseAlert(alert));
      }
      routeIds.forEach((routeId) => {
        if (
          alert.informedEntities.find((entity) => entity.routeId === routeId)
        ) {
          result.routeAlerts[routeId].push(makeConciseAlert(alert));
        }
      });
      return result;
    },
    {
      stopAlerts: [],
      routeAlerts: Object.fromEntries(routeIds.map((id) => [id, []])),
    },
  );

  return new Response(
    JSON.stringify({
      predictions: filteredPredictions,
      alerts: filteredAlerts,
    }),
  );
}
