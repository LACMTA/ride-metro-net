import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { getLineSlug } from "../lib/routeShortNameOverrides";
import type {
  RouteShapeFeature,
  RouteShapesGeoJSON,
} from "../lib/getRouteShapes";

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

function shapeOptionLabel(feature: RouteShapeFeature, index: number): string {
  const dirs = feature.properties.directionIds
    .map((d) => (d === null ? "—" : String(d)))
    .join("/");
  return `Variant ${index + 1} (direction ${dirs})`;
}

export default function LineMap({ routeId, routeColor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const shapeLayerRef = useRef<import("leaflet").GeoJSON | null>(null);

  const [geojson, setGeojson] = useState<RouteShapesGeoJSON | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Mount: create the map + base layer and fetch the route shape GeoJSON.
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      const [{ default: L }] = await Promise.all([
        import("leaflet"),
        import("esri-leaflet-vector"),
      ]);

      // Guard: container may have been removed while awaiting
      if (cancelled || !containerRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, { minZoom: 2 }).setView(
        DEFAULT_CENTER,
        DEFAULT_ZOOM,
      );
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // TODO: Metro Branded Basemap
      // vectorBasemapLayer(BASEMAP_ENUM, { apiKey: ESRI_KEY }).addTo(map);

      // Fetch and render the line's GeoJSON shape. The endpoint is prerendered
      // at build time from the static GTFS — see /src/pages/data/route-shape/[routeId].json.ts.
      // The URL uses the same slug as the page (e.g. "a" for the A Line, "720"
      // for a numeric bus route), so resolve it from the numeric route_id.
      const slug = getLineSlug(routeId);
      try {
        const res = await fetch(`/data/route-shape/${slug}.json`);
        if (!res.ok) {
          throw new Error(`Shape fetch failed: ${res.status}`);
        }
        const data = (await res.json()) as RouteShapesGeoJSON;
        if (cancelled) return;
        setGeojson(data);
        setSelectedIndex(0);
      } catch (err) {
        // Non-fatal: leave the map on its default LA-wide view.
        console.error("Failed to load route shape:", err);
      }
    })();

    return () => {
      cancelled = true;
      shapeLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [routeId]);

  // Selection: render only the currently selected shape feature, swapping
  // layers in place when the selection (or color) changes.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !geojson || geojson.features.length === 0) return;

    const feature = geojson.features[selectedIndex] ?? geojson.features[0];

    if (shapeLayerRef.current) {
      shapeLayerRef.current.remove();
      shapeLayerRef.current = null;
    }

    const shapeLayer = L.geoJSON(feature, {
      style: {
        color: routeColor ? `#${routeColor}` : "#000",
        weight: 4,
        opacity: 0.9,
      },
    }).addTo(map);
    shapeLayerRef.current = shapeLayer;

    const bounds = shapeLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [geojson, selectedIndex, routeColor]);

  const options = useMemo(() => {
    if (!geojson) return [];
    return geojson.features.map((f, i) => ({
      value: i,
      label: shapeOptionLabel(f, i),
    }));
  }, [geojson]);

  return (
    <div className="mb-8">
      {options.length > 1 && (
        <div className="mb-2">
          <label className="mr-2 text-sm font-medium" htmlFor="shape-select">
            Shape:
          </label>
          <select
            id="shape-select"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-96 w-full overflow-hidden rounded-lg"
        aria-label="Map of Metro line route"
        role="img"
      />
    </div>
  );
}
