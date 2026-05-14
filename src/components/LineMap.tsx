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

function shapeOptionLabel(feature: RouteShapeFeature): string {
  const stops = feature.properties.stops;
  const terminal = stops.at(-1);
  return terminal ? `${terminal.stopName}` : "Unknown direction";
}

export default function LineMap({ routeId, routeColor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  // Tracks all shape layers (ghost + selected) so they can be removed together.
  const shapeLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const stopsLayerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const [geojson, setGeojson] = useState<RouteShapesGeoJSON | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [serviceType, setServiceType] = useState<"core" | "owl">("core");
  const [splitLineNumber, setSplitLineNumber] = useState<string | null>(null);

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
        // Initialise split-line selection to the first sub-line number found.
        if (data.isSplitline) {
          const firstNumber = data.features.find(
            (f) => f.properties.splitLineNumber !== undefined,
          )?.properties.splitLineNumber;
          setSplitLineNumber(firstNumber ?? null);
        } else {
          setSplitLineNumber(null);
        }
      } catch (err) {
        // Non-fatal: leave the map on its default LA-wide view.
        console.error("Failed to load route shape:", err);
      }
    })();

    return () => {
      cancelled = true;
      shapeLayerRef.current = null;
      stopsLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [routeId]);

  // Derive the sorted unique split-line numbers from the GeoJSON features.
  const splitLineNumbers = useMemo(() => {
    if (!geojson?.isSplitline) return [];
    const seen = new Set<string>();
    for (const f of geojson.features) {
      if (f.properties.splitLineNumber !== undefined) {
        seen.add(f.properties.splitLineNumber);
      }
    }
    return [...seen].sort();
  }, [geojson]);

  // When the split-line number changes, reset service type and direction.
  useEffect(() => {
    setServiceType("core");
  }, [splitLineNumber]);

  // When switching service type, reset the direction selection to the first
  // feature matching the new service type (and split-line number, if applicable).
  useEffect(() => {
    if (!geojson) return;
    const firstMatch = geojson.features.findIndex(
      (f) =>
        f.properties.serviceType === serviceType &&
        (splitLineNumber === null ||
          f.properties.splitLineNumber === splitLineNumber),
    );
    setSelectedIndex(firstMatch === -1 ? 0 : firstMatch);
  }, [serviceType, splitLineNumber, geojson]);

  // Selection: render the selected shape feature and, for split lines, a ghost
  // path for the non-selected side at 65% opacity (stops not shown for ghost).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !geojson || geojson.features.length === 0) return;

    const feature = geojson.features[selectedIndex] ?? geojson.features[0];

    // Guard against a stale `selectedIndex` whose feature doesn't match the
    // currently-selected filters. When the user picks a new split-line (or
    // service type), `splitLineNumber` / `serviceType` change first; the
    // effect that resets `selectedIndex` runs in a separate update, and we
    // don't want this effect to draw — and fit bounds to — the wrong feature
    // in between.
    if (
      feature.properties.serviceType !== serviceType ||
      (splitLineNumber !== null &&
        feature.properties.splitLineNumber !== splitLineNumber)
    ) {
      return;
    }

    // Remove previous shape and stop layers.

    if (shapeLayerRef.current) {
      shapeLayerRef.current.remove();
      shapeLayerRef.current = null;
    }
    if (stopsLayerRef.current) {
      stopsLayerRef.current.remove();
      stopsLayerRef.current = null;
    }

    const lineColor = routeColor ? `#${routeColor}` : "#000";

    const shapeGroup = L.layerGroup().addTo(map);
    shapeLayerRef.current = shapeGroup;

    // Ghost layer: non-selected split-line side, same service type, 35% opacity, no stops.
    if (geojson.isSplitline && splitLineNumber !== null) {
      const ghostFeatures = geojson.features.filter(
        (f) =>
          f.properties.splitLineNumber !== splitLineNumber &&
          f.properties.serviceType === serviceType,
      );
      if (ghostFeatures.length > 0) {
        L.geoJSON(
          {
            type: "FeatureCollection",
            features: ghostFeatures,
          } as import("geojson").FeatureCollection,
          {
            style: { color: lineColor, weight: 6, opacity: 0.35 },
          },
        ).addTo(shapeGroup);
      }
    }

    // Selected feature layer — rendered on top of the ghost.
    L.geoJSON(feature, {
      style: { color: lineColor, weight: 6, opacity: 0.9 },
    }).addTo(shapeGroup);

    // Render a circle marker for each stop served by the selected shape only.
    const stopsGroup = L.layerGroup().addTo(map);
    stopsLayerRef.current = stopsGroup;

    for (const stop of feature.properties.stops) {
      L.circleMarker([stop.lat, stop.lon], {
        radius: 5,
        color: lineColor,
        weight: 3,
        fillColor: "#fff",
        fillOpacity: 1,
      })
        .bindPopup(`<strong>${stop.stopName}</strong>`)
        .addTo(stopsGroup);
    }

    // Fit the map to the selected feature AND the ghost (when present) so
    // neither is clipped at the map edge. Collecting all coordinates first
    // avoids an extra fitBounds call or a two-step extend pattern.
    const allLatLngs: [number, number][] = [
      ...feature.geometry.coordinates.map(
        ([lon, lat]) => [lat, lon] as [number, number],
      ),
      ...feature.properties.stops.map(
        (s) => [s.lat, s.lon] as [number, number],
      ),
    ];

    if (geojson.isSplitline && splitLineNumber !== null) {
      const ghostFeatures = geojson.features.filter(
        (f) =>
          f.properties.splitLineNumber !== splitLineNumber &&
          f.properties.serviceType === serviceType,
      );
      for (const gf of ghostFeatures) {
        for (const [lon, lat] of gf.geometry.coordinates) {
          allLatLngs.push([lat, lon]);
        }
      }
    }

    map.fitBounds(L.latLngBounds(allLatLngs), { padding: [20, 20] });

  }, [geojson, selectedIndex, routeColor, splitLineNumber, serviceType]);

  // Filtered direction options — respects both service type and split-line number.
  const filteredOptions = useMemo(() => {
    if (!geojson) return [];
    return geojson.features
      .map((f, i) => ({
        value: i,
        label: shapeOptionLabel(f),
        serviceType: f.properties.serviceType,
        splitLineNumber: f.properties.splitLineNumber,
      }))
      .filter(
        (opt) =>
          opt.serviceType === serviceType &&
          (splitLineNumber === null || opt.splitLineNumber === splitLineNumber),
      );
  }, [geojson, serviceType, splitLineNumber]);

  // Whether this route has owl service for the currently selected sub-line.
  const hasOwlServiceForSelection = useMemo(() => {
    if (!geojson?.hasOwlService) return false;
    if (!geojson.isSplitline || splitLineNumber === null) {
      return geojson.hasOwlService;
    }
    return geojson.features.some(
      (f) =>
        f.properties.serviceType === "owl" &&
        f.properties.splitLineNumber === splitLineNumber,
    );
  }, [geojson, splitLineNumber]);

  return (
    <div className="bg-background-white mb-8 rounded-lg">
      <div className="mb-2 flex flex-wrap items-center gap-3 px-3 pt-3 pb-1">
        {geojson?.isSplitline && splitLineNumbers.length > 0 && (
          <div>
            <label className="mr-2 font-medium" htmlFor="split-line-select">
              Line:
            </label>
            <select
              id="split-line-select"
              className="border-divider-line rounded border px-2 py-1"
              value={splitLineNumber ?? ""}
              onChange={(e) => setSplitLineNumber(e.target.value || null)}
            >
              {splitLineNumbers.map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </div>
        )}
        {hasOwlServiceForSelection && (
          <div>
            <label className="mr-2 font-medium" htmlFor="service-type-select">
              Service:
            </label>
            <select
              id="service-type-select"
              className="border-divider-line rounded border px-2 py-1"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as "core" | "owl")}
            >
              <option value="core">Core</option>
              <option value="owl">Owl</option>
            </select>
          </div>
        )}
        <div>
          <label className="mr-2 font-medium" htmlFor="shape-select">
            To:
          </label>
          <select
            id="shape-select"
            className="border-divider-line rounded border px-2 py-1"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
          >
            {filteredOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-96 w-full overflow-hidden"
        aria-label="Map of Metro line route"
        role="img"
      />
    </div>
  );
}
