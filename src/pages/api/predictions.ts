export const prerender = false;

type PredictionsApiResponse = {
  data: {
    agencyKey: string;
    predictionsData: RoutePredictions[];
  };
  route: string;
  success: boolean;
};

export type RoutePredictions = {
  destinations: {
    directionId: string; //swiftly returns a string
    headsign: string;
    predictions: Prediction[];
  }[];
  routeId: string;
  routeName: string;
  routeShortName: string;
  stopCode: number;
  stopId: string;
  stopName: string;
};

export type Prediction = {
  min: number;
  sec: number;
  time: number;
  tripId: string;
  vehicleId: string;
};

/**
 * GET /api/predictions
 * @param {string} stopId - The stop ID to provide predictions for
 * @returns {PredictionSet[]} Array of predictions
 */
export async function GET(context: import("astro").APIContext) {
  const API_KEY = Netlify.env.get("API_KEY");
  const stopId = context.url.searchParams.get("stopId");

  if (!stopId)
    return new Response("stopId query parameter is required", { status: 400 });

  // TODO: generalize for trains
  const AGENCY_KEY = "lametro";

  const predictionsUrl = new URL(
    `https://api.goswift.ly/real-time/${AGENCY_KEY}/predictions`,
  );
  predictionsUrl.searchParams.append("stop", stopId);

  const predictionsResponsePromise = fetch(predictionsUrl.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: API_KEY as string,
    },
  });

  const predictionsResponse = await predictionsResponsePromise;

  if (!predictionsResponse.ok) {
    console.error(await predictionsResponse.text());
    return new Response(`Swifty request failed!`, {
      status: 500,
    });
  }

  const predictionsData: PredictionsApiResponse =
    await predictionsResponse.json();
  const filteredPredictions = predictionsData.data.predictionsData;

  return new Response(JSON.stringify(filteredPredictions));
}
