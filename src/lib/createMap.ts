import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, MapOptions } from "maplibre-gl";

type MapLibreGL = typeof import("maplibre-gl");

/**
 * ESRI Vector Tile basemap style ID — Metro branded vector basemap (custom
 * style created with the ArcGIS Vector Tile Style Editor).
 * See https://github.com/LACMTA/map-template.
 */
const ESRI_BASEMAP_ENUM = "65aff2873118478482ec3dec199e9058";

/** Default center: LA Metro service area. */
const DEFAULT_CENTER: [number, number] = [
  -118.25133692966446, 34.00095151499077,
];

const DEFAULT_ZOOM = 11;

export interface CreateMapResult {
  map: MLMap;
  /** The MapLibre GL JS namespace — needed for `Popup`, `LngLatBounds`, etc. */
  maplibregl: MapLibreGL;
}

/**
 * Creates a MapLibre GL JS map in the given container with the Metro-branded
 * ESRI vector basemap already applied. Dynamically imports MapLibre and the
 * MapLibre ArcGIS plugin to keep them out of the initial bundle.
 *
 * The custom Metro basemap style is loaded via
 * `maplibreArcGIS.BasemapStyle.applyStyle`, which handles authentication,
 * style fetching, and Esri/data attribution automatically.
 *
 * The basemap is best-effort: if the ESRI key is invalid or the service is
 * unreachable, the map still initializes (the style will fail to load, but
 * the map container remains interactive).
 */
export async function createMap(
  container: HTMLElement,
  esriKey: string,
): Promise<CreateMapResult> {
  const maplibregl = await import("maplibre-gl");
  const { BasemapStyle } = await import("@esri/maplibre-arcgis");

  const options: MapOptions = {
    container,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: 2,
    attributionControl: { compact: true },
  };

  const map = new maplibregl.Map(options);

  // Apply the custom Metro-branded ESRI Vector Tile Style by item ID.
  // The plugin fetches the style JSON + vector tile sources and applies
  // Esri/data attribution automatically.
  BasemapStyle.applyStyle(map, {
    map,
    style: ESRI_BASEMAP_ENUM,
    token: esriKey,
  });

  // Add zoom/rotate controls.
  map.addControl(new maplibregl.NavigationControl());

  return { map, maplibregl };
}
