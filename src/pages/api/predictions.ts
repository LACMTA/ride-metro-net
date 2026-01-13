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
  const API_KEY = import.meta.env.API_KEY;
  const stopId = context.url.searchParams.get("stopId");

  if (!stopId)
    return new Response("stopId query parameter is required", { status: 400 });

  // TODO: generalize for trains
  const AGENCY_KEY = "lametro";

  const predictionsUrl = new URL(
    `https://api.goswift.ly/real-time/${AGENCY_KEY}/predictions`,
  );
  predictionsUrl.searchParams.append("stop", stopId);

  console.log(`Fetching predictions from: ${predictionsUrl.toString()}`);

  const predictionsResponse = await fetch(predictionsUrl.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: API_KEY as string,
    },
    // Add timeout for better cold start handling
    signal: AbortSignal.timeout(25000), // 25 second timeout
  });

  if (!predictionsResponse.ok) {
    const errorText = await predictionsResponse.text();
    console.error(
      `Swiftly predictions API error (${predictionsResponse.status}):`,
      errorText,
    );
    return new Response(
      JSON.stringify({
        error: "External API request failed",
        status: predictionsResponse.status,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 502, // Bad Gateway - external service issue
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const predictionsData: PredictionsApiResponse =
    await predictionsResponse.json();
  const filteredPredictions = predictionsData.data.predictionsData;

  return new Response(JSON.stringify(filteredPredictions));
}
