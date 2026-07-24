import { useStore } from "@nanostores/react";
import {
  lineMapGeoJson,
  lineMapSelection,
  getSelectedShape,
} from "../lib/lineMapStore";
import RouteBadge from "./RouteBadge";
import { getLineSlug } from "../lib/routeShortNameOverrides";

/**
 * Renders the ordered list of stops for the currently selected trip
 * (direction, service type, and split-line) in the line map.
 *
 * Reads all state from the shared `lineMapStore` nanostores so it stays
 * in sync with the Leaflet map controls automatically.
 *
 * Each stop row also shows small badges for other Metro lines that serve
 * the same parent station ("connecting lines"). This data is enriched
 * server-side in the GeoJSON payload, so no additional client-side
 * fetching is needed.
 */
export default function StopList() {
  const geojson = useStore(lineMapGeoJson);
  const selection = useStore(lineMapSelection);

  if (!geojson) {
    return <p className="p-4 text-gray-500">Loading stops…</p>;
  }

  const feature = getSelectedShape(geojson, selection);
  if (!feature) {
    return (
      <p className="p-4 text-gray-500">No stops found for this selection.</p>
    );
  }

  const stops = feature.properties.stops;

  return (
    <ol className="bg-background-white mb-8 divide-y divide-gray-200 rounded-lg">
      {stops.map((stop, index) => (
        <li key={stop.stopId} className="flex items-start gap-3 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
            {index + 1}
          </span>
          <div className="flex flex-col gap-1">
            <a
              href={`/stops/${stop.parentStationId ?? stop.stopId}/`}
              className="text-metro-text hover:text-metro-blue hover:underline"
            >
              {stop.stopName}
            </a>
            {stop.connections.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {stop.connections.map((route) => (
                  <RouteBadge
                    key={route.routeId}
                    routeId={route.routeId}
                    routeType={route.routeType}
                    name={route.routeShortName}
                    color={route.routeColor}
                    textColor={route.routeTextColor}
                    href={`/lines/${getLineSlug(route.routeId)}/`}
                    size="sm"
                  />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
