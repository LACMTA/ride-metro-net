export const prerender = false;

type ApiResponse = {
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

export async function GET(context: import("astro").APIContext) {
  const { env } = context.locals.runtime;
  const { stopId } = context.params;

  if (!stopId) return new Response("Stop ID is required", { status: 400 });

  // TODO: generalize for trains
  const AGENCY_KEY = "lametro";
  const url = new URL(
    `https://api.goswift.ly/real-time/${AGENCY_KEY}/predictions`,
  );
  url.searchParams.append("stop", stopId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: env.API_KEY as string,
    },
  });
  if (!response.ok) {
    console.error(await response.text());
    return new Response(`Swifty request failed!`, {
      status: 500,
    });
  }
  const responseData: ApiResponse = await response.json();
  const data = responseData.data.predictionsData;

  return new Response(JSON.stringify(data));
}
