import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, MapOptions, IControl } from "maplibre-gl";

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
    // Disable MapLibre's built-in AttributionControl so it doesn't conflict
    // with the ESRI plugin's own AttributionControl (added by
    // `BasemapStyle.applyStyle` via `_setEsriAttribution`). The plugin's
    // `canAdd` method throws if it finds a MapLibre AttributionControl whose
    // `customAttribution` is undefined, so we let the plugin own attribution.
    attributionControl: false,
  };

  const map = new maplibregl.Map(options);

  // Apply the custom Metro-branded ESRI Vector Tile Style by item ID.
  // The plugin fetches the style JSON + vector tile sources and applies
  // Esri/data attribution automatically. We pass `attributionControl` here so
  // the plugin's own AttributionControl is compact and starts collapsed,
  // avoiding MapLibre's built-in control (disabled above) which would
  // otherwise conflict with the plugin's `canAdd` check.
  const basemapStyle = BasemapStyle.applyStyle(map, {
    map,
    style: ESRI_BASEMAP_ENUM,
    token: esriKey,
    attributionControl: { compact: true, collapsed: true },
  });

  // The ESRI plugin adds its AttributionControl at MapLibre's default position
  // (bottom-right). Relocate it to the bottom-left corner so the bottom-right
  // corner stays clear for the "find my location" button overlay (see
  // SystemMap.astro). The plugin emits `BasemapAttributionLoad` once the
  // control has been added, handing us the control instance to move.
  //
  // Note: the plugin's `AttributionControl` type declares `onAdd` as
  // `HTMLElement | null`, which is structurally incompatible with MapLibre's
  // `IControl` (`HTMLElement`), so we cast through `IControl`. At runtime the
  // control extends `maplibregl.AttributionControl`, so this is safe.
  basemapStyle.on("BasemapAttributionLoad", (ctrl) => {
    const control = ctrl as unknown as IControl;
    map.removeControl(control);
    map.addControl(control, "bottom-left");
  });

  // Add zoom/rotate controls.
  map.addControl(new maplibregl.NavigationControl());

  return { map, maplibregl };
}
