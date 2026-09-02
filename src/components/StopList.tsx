import { useStore } from "@nanostores/react";
import {
  lineMapGeoJson,
  lineMapSelection,
  getSelectedShape,
} from "../lib/lineMapStore";
import RouteBadge from "./RouteBadge";
import { getLineSlug } from "../lib/routeShortNameOverrides";

interface StopListProps {
  /** Resolved line color as a CSS hex string (e.g. `"#E47525"`). */
  lineColor: string;
}

/** Shared Tailwind classes for the absolute-positioned vertical connector lines. */
const CONNECTOR_CLASS = "absolute left-1/2 z-0 w-1.5 -translate-x-1/2";
/** Shared inline style for connector lines — uses the route color. */
const CONNECTOR_STYLE = (lineColor: string) => ({ backgroundColor: lineColor });
/** Shared Tailwind classes for the stop dot element. */
const DOT_CLASS = "h-4 w-4 rounded-full border-4 bg-white";
/** Shared inline style for the stop dot border — uses the route color. */
const DOT_STYLE = (lineColor: string) => ({ borderColor: lineColor });

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
 *
 * The stop dots and connecting line segments mirror the visual language
 * of the map: white-filled circles outlined in the route's color, with
 * a vertical line segment connecting adjacent stops.
 */
export default function StopList({ lineColor }: StopListProps) {
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
  const lastIndex = stops.length - 1;

  return (
    <ul
      className="bg-background-white mb-8 divide-y divide-gray-200 rounded-lg"
      aria-label="Stops on this route"
    >
      {stops.map((stop, index) => (
        <li key={stop.stopId} className="flex items-stretch gap-3 px-4">
          {/* Dot rail: fixed-width column containing the stop dot with
              vertical connector lines above (except first stop) and below
              (except last stop). Connectors are absolutely positioned so
              they extend behind the dot with no visible gap; the dot's
              white fill + z-10 hides the overlap.

              Layout spacers keep the dot aligned with the first line of text:
              h-4 spacer (16px) + h-6 dot box (24px) puts the dot center at
              28px — matching the text's first-line center (16px top padding +
              ~12px half line-height). */}
          <div
            className="relative flex w-5 shrink-0 flex-col items-center"
            aria-hidden="true"
          >
            {/* Upward connector: from top of <li> to dot center (h-4 + h-6/2 = h-7 = 28px) */}
            {index > 0 && (
              <span
                className={`${CONNECTOR_CLASS} top-0 h-7`}
                style={CONNECTOR_STYLE(lineColor)}
              />
            )}
            {/* Top spacer — matches content's top padding */}
            <span className="h-4 shrink-0" />
            {/* Stop dot — z-10 so white fill covers connector overlap */}
            <div className="relative z-10 flex h-6 shrink-0 items-center justify-center">
              <span className={DOT_CLASS} style={DOT_STYLE(lineColor)} />
            </div>
            {/* Bottom spacer — grows to fill remaining content height */}
            <span className="shrink-0 grow" />
            {/* Downward connector: from dot center (top-7) to bottom of <li> */}
            {index < lastIndex && (
              <span
                className={`${CONNECTOR_CLASS} top-7 bottom-0`}
                style={CONNECTOR_STYLE(lineColor)}
              />
            )}
          </div>
          {/* Content column: stop name link + connecting-line badges. */}
          <div className="flex flex-col gap-1 py-4">
            <a
              href={`/stops/${stop.parentStationId ?? stop.stopId}/`}
              className="text-metro-text hover:text-link-hover font-bold hover:underline"
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
    </ul>
  );
}
