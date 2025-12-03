import trips from "../../../../data/trips.json";

export const prerender = false;
export async function GET(context: import("astro").APIContext) {
  const { env } = context.locals.runtime;
  const { route_id } = context.params;

  const trip_ids = trips[route_id];

  const url = new URL(
    "https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-vehicle-positions",
  );
  url.searchParams.append("format", "json");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept:
        "application/json, application/json; charset=utf-8, text/csv; charset=utf-8",
      Authorization: env.API_KEY as string,
    },
  });
  const data = (await response.json()).entity;

  data.reduce((res, vehicle) => {
    console.log(vehicle);
    if (vehicle?.vehicle?.trip?.tripId in trip_ids) {
      res.append(vehicle);
    }
    return res;
  }, []);

  return new Response(JSON.stringify(data));
}
