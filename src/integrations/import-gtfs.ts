import { importGtfs, openDb } from "gtfs";
import fs from "fs";
import path from "path";

const TRIPS_DIR = "./data";
const TRIPS_FILE = "trips.json";

export const GTFSconfig = {
  sqlitePath: ":memory:",
  // sqlitePath: "./data/test.db",
  agencies: [
    {
      // train
      url: "https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip?ref_type=heads&inline=false",
      // Uncomment for bus data:
      // url: 'https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip?ref_type=heads&inline=false',
    },
  ],
  verbose: true,
};

export default function importGTFS() {
  return {
    name: "data-import",
    hooks: {
      "astro:config:done": async () => {
        console.log("Importing GTFS to in-memory SQLite database...");
        await importGtfs(GTFSconfig);
        getTripIndex();
      },
    },
  };
}

const SEPERATOR = ",";

const getTripIndex = async function () {
  const db = openDb(GTFSconfig);
  const query = ` 
    SELECT 
      trips.route_id,
      GROUP_CONCAT(trips.trip_id, '${SEPERATOR}') as trip_ids
    FROM trips 
    LEFT JOIN routes ON routes.route_id = trips.route_id
	  GROUP BY routes.route_id
        `;
  const results = (await db.prepare(query).all()) as [
    { route_id: string; trip_ids: string },
  ];
  const trips = results.map((trip) => ({
    [trip.route_id]: trip.trip_ids.split(SEPERATOR),
  }));

  fs.mkdirSync(TRIPS_DIR, { recursive: true });
  fs.writeFileSync(path.join(TRIPS_DIR, TRIPS_FILE), JSON.stringify(trips));
};
