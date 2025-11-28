import { importGtfs } from "gtfs";

export const GTFSconfig = {
  sqlitePath: ":memory:",
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
      },
    },
  };
}
