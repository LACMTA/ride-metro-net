import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { getLineSlug } from "../lib/routeShortNameOverrides";
import type { RouteShapesGeoJSON } from "../lib/getRouteShapes";

// TODO: get key for this project
// const ESRI_KEY =

// Metro Branded Basemap enum ID
// const BASEMAP_ENUM = "65aff2873118478482ec3dec199e9058";

// Default center: LA Metro service area
const DEFAULT_CENTER: [number, number] = [
  34.00095151499077, -118.25133692966446,
];
const DEFAULT_ZOOM = 11;

interface Props {
  /** Stable numeric (or lettered) route slug, e.g. "a" or "720". */
  routeId: string;
  /** GTFS `route_color` hex without the leading `#`, e.g. `"E47525"`. */
  routeColor: string;
}

export default function LineMap({ routeId, routeColor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamic imports keep Leaflet (and its DOM requirements) out of SSR.
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      const [{ default: L }] = await Promise.all([
        import("leaflet"),
        import("esri-leaflet-vector"),
      ]);

      // Guard: container may have been removed while awaiting
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { minZoom: 2 }).setView(
        DEFAULT_CENTER,
        DEFAULT_ZOOM,
      );

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // TODO: Metro Branded Basemap
      // vectorBasemapLayer(BASEMAP_ENUM, { apiKey: ESRI_KEY }).addTo(map);

      // Fetch and render the line's GeoJSON shape. The endpoint is prerendered
      // at build time from the static GTFS — see /src/pages/data/lines/[routeId].json.ts.
      // The URL uses the same slug as the page (e.g. "a" for the A Line, "720"
      // for a numeric bus route), so resolve it from the numeric route_id.
      const slug = getLineSlug(routeId);
      try {
        const res = await fetch(`/data/route-shape/${slug}.json`);
        if (!res.ok) {
          throw new Error(`Shape fetch failed: ${res.status}`);
        }
        const geojson = (await res.json()) as RouteShapesGeoJSON;
        if (cancelled || !map) return;
        if (!geojson.features || geojson.features.length === 0) return;

        const shapeLayer = L.geoJSON(geojson, {
          style: {
            color: routeColor ? `#${routeColor}` : "#000",
            weight: 4,
            opacity: 0.9,
          },
        }).addTo(map);

        const bounds = shapeLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
        }
      } catch (err) {
        // Non-fatal: leave the map on its default LA-wide view.
        console.error("Failed to load route shape:", err);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [routeId, routeColor]);

  return (
    <div className="mb-8">
      <div
        ref={containerRef}
        className="h-96 w-full overflow-hidden rounded-lg"
        aria-label="Map of Metro line route"
        role="img"
      />
    </div>
  );
}
