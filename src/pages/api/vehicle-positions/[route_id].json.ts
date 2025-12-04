import trips from "../../../../data/trips.json";

// Type definitions for the GTFS-RT vehicle positions API response
interface VehiclePosition {
  vehicle: {
    trip: {
      tripId: string;
      directionId: number;
    };
    stopId: string;
    currentStatus: string;
  };
}

interface GTFSRTResponse {
  entity: VehiclePosition[];
}

export const prerender = false;
export async function GET(context: import("astro").APIContext) {
  const { env } = context.locals.runtime;
  const { route_id } = context.params;
  const direction_id = context.url.searchParams.get("direction_id");

  if (!route_id) return new Response("Route ID is required", { status: 400 });
  if (!(route_id in trips)) {
    return new Response("Route ID not found", { status: 404 });
  }

  const trip_ids = trips[route_id as keyof typeof trips];

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
  if (!response.ok) {
    return new Response(`Swifty request failed!\n${response.body}`, {
      status: 404,
    });
  }
  const responseData = (await response.json()) as GTFSRTResponse;
  const data = responseData.entity;

  const filteredData = data.reduce((res: any[], vehicle: VehiclePosition) => {
    if (trip_ids.indexOf(vehicle?.vehicle?.trip?.tripId.toString()) > 0) {
      if (
        direction_id === null ||
        vehicle.vehicle.trip.directionId === Number(direction_id)
      ) {
        const formatted = {
          trip_id: vehicle.vehicle.trip.tripId.toString(),
          stop_id: vehicle.vehicle.stopId.toString(),
          status: vehicle.vehicle.currentStatus,
          direction_id: vehicle.vehicle.trip.directionId,
        };
        res.push(formatted);
      }
    }
    return res;
  }, []);

  return new Response(JSON.stringify(filteredData));
}
