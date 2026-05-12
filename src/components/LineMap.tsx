import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// This "Map Template API Key" expires on 11/1/2026 (1 year expiration limit)
// and is limited to use on Metro GitHub pages.
const ESRI_KEY =
  "AAPTxy8BH1VEsoebNVZXo8HurCIBEXS58hLwaInNH7mnZeFDQtLv6ne8Ndu9F_uhRYlcTA40UoLVimr9v8aBPwLjUCQK9nvWJXNkIKPHHHab8vJzfNL9bl4-OrkgF2a_Q-upRIopvKi92zbulIod1zKjuz-lmxdGdlA3QhvGoVtgjmCWGdTofmmIHL4zOM0j2kPAzU-fE8F5fqInveGjdj4OGGMBECO4WJYSqhc_YWTlQOmM1AbMoKxoKVIErkMt0rdgAT1_QkwBNXZk";

// Metro Branded Basemap enum ID
const BASEMAP_ENUM = "65aff2873118478482ec3dec199e9058";

// Existing Metro Rail and Busway tiled layer
// https://lametro.maps.arcgis.com/home/item.html?id=17fc6859e51e4188b4a4120fcbd2e43d
const RAIL_BUSWAY_URL =
  "https://tiles.arcgis.com/tiles/TNoJFjk1LsD45Juj/arcgis/rest/services/Map_RGB_Vector_Offset_RC5/MapServer";

// Default center: LA Metro service area
const DEFAULT_CENTER: [number, number] = [34.00095151499077, -118.25133692966446];
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
      const { tiledMapLayer } = await import("esri-leaflet");

      // Guard: container may have been removed while awaiting
      if (!containerRef.current) return;

      map = L.map(containerRef.current, { minZoom: 2 }).setView(
        DEFAULT_CENTER,
        DEFAULT_ZOOM,
      );

      // Metro Branded Basemap
      vectorBasemapLayer(BASEMAP_ENUM, { apiKey: ESRI_KEY }).addTo(map);

      // Metro Rail and Busway overlay
      tiledMapLayer({ url: RAIL_BUSWAY_URL, apiKey: ESRI_KEY }).addTo(map);
    })();

    return () => {
      map?.remove();
    };
  }, []);

  return (
    <div className="mb-8">
      <div
        ref={containerRef}
        className="h-96 w-full rounded-lg overflow-hidden"
        aria-label="Map of Metro line route"
        role="img"
      />
    </div>
  );
}
