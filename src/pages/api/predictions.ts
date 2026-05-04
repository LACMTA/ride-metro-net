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
 * @param {string} stopId - Comma-separated list of stop IDs to fetch predictions for.
 *   For parent stations, pass the child stop IDs. Results are aggregated into a single array.
 * @param {string} agency - The Swiftly agency key.
 * @returns {RoutePredictions[]} Aggregated array of predictions across all requested stops.
 */
export async function GET(context: import("astro").APIContext) {
  const API_KEY = import.meta.env.API_KEY;
  const stopIdParam = context.url.searchParams.get("stopId");
  const agency = context.url.searchParams.get("agency");

  if (!stopIdParam)
    return new Response("stopId query parameter is required", { status: 400 });
  if (!agency)
    return new Response("agency query parameter is required", { status: 400 });

  const stopIds = stopIdParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const fetchForStop = async (stopId: string): Promise<RoutePredictions[]> => {
    const predictionsUrl = new URL(
      `https://api.goswift.ly/real-time/${agency}/predictions`,
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
      signal: AbortSignal.timeout(25000), // 25 second timeout
    });

    if (!predictionsResponse.ok) {
      const errorText = await predictionsResponse.text();
      console.error(
        `Swiftly predictions API error for stop ${stopId} (${predictionsResponse.status}):`,
        errorText,
      );
      // Return empty rather than failing the whole request when one stop fails
      return [];
    }

    const data: PredictionsApiResponse = await predictionsResponse.json();
    return data.data.predictionsData;
  };

  const results = await Promise.all(stopIds.map(fetchForStop));
  const allPredictions = results.flat();

  // clamping any values less then 0 (Swiftly returns this sometimes)
  const sanitizedPredictions = allPredictions.map((route) => ({
    ...route,
    destinations: route.destinations.map((dest) => ({
      ...dest,
      predictions: dest.predictions.map((p) => ({
        ...p,
        sec: p.sec < 0 ? 0 : p.sec,
        min: p.min < 0 ? 0 : p.min,
      })),
    })),
  }));

  return new Response(JSON.stringify(sanitizedPredictions));
}
