import { importGtfs, openDb } from "gtfs";

export const GTFSconfig = {
  sqlitePath: ":memory:",
  // TODO: optionally import to file and re-use to improve dev server startup
  // sqlitePath: "./data/data.db",
  agencies: [
    {
      // train
      url: "https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip?ref_type=heads&inline=false",
    },
    {
      // bus
      url: "https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip?ref_type=heads&inline=false",
    },
  ],
  verbose: true,
  ignoreDuplicates: true,
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
