import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// TODO: get key for this project
// const ESRI_KEY =

// Metro Branded Basemap enum ID
// const BASEMAP_ENUM = "65aff2873118478482ec3dec199e9058";

// Default center: LA Metro service area
const DEFAULT_CENTER: [number, number] = [
  34.00095151499077, -118.25133692966446,
];
const DEFAULT_ZOOM = 11;

export default function LineMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamic imports keep Leaflet (and its DOM requirements) out of SSR.
    let map: import("leaflet").Map | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      const { vectorBasemapLayer } = await import("esri-leaflet-vector");

      // Guard: container may have been removed while awaiting
      if (!containerRef.current) return;

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
    })();

    return () => {
      map?.remove();
    };
  }, []);

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
