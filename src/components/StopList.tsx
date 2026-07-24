import { useStore } from "@nanostores/react";
import {
  lineMapGeoJson,
  lineMapSelection,
  getSelectedShape,
} from "../lib/lineMapStore";

/**
 * Renders the ordered list of stops for the currently selected trip
 * (direction, service type, and split-line) in the line map.
 *
 * Reads all state from the shared `lineMapStore` nanostores so it stays
 * in sync with the Leaflet map controls automatically.
 */
export default function StopList() {
  const geojson = useStore(lineMapGeoJson);
  const selection = useStore(lineMapSelection);

  if (!geojson) {
    return <p className="p-4 text-gray-500">Loading stops…</p>;
  }

  const feature = getSelectedShape(geojson, selection);
  if (!feature) {
    return <p className="p-4 text-gray-500">No stops found for this selection.</p>;
  }

  const stops = feature.properties.stops;

  return (
    <ol className="bg-background-white mb-8 divide-y divide-gray-200 rounded-lg">
      {stops.map((stop, index) => (
        <li key={stop.stopId} className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
            {index + 1}
          </span>
          <a
            href={`/stops/${stop.stopId}/`}
            className="text-metro-text hover:text-metro-blue hover:underline"
          >
            {stop.stopName}
          </a>
        </li>
      ))}
    </ol>
  );
}