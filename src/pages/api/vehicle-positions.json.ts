export async function GET(context: import("astro").APIContext) {
  const { env } = context.locals.runtime;

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

  const data = await response.json();

  return new Response(JSON.stringify(data));
}
