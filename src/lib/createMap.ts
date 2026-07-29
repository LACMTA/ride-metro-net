import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, DEFAULT_ZOOM, ESRI_BASERMAP_ENUM } from "./mapConfig";

type LeafletModule = typeof import("leaflet");

export interface CreateMapResult {
  L: LeafletModule;
  map: import("leaflet").Map;
}

/**
 * Creates a Leaflet map in the given container with the Metro-branded ESRI
 * vector basemap already applied. Dynamically imports Leaflet and
 * esri-leaflet-vector to keep them out of the initial bundle.
 *
 * The basemap layer is best-effort: if the ESRI key is invalid or the service
 * is unreachable, the map still initializes on the default LA-wide view.
 */
export async function createMap(
  container: HTMLElement,
  esriKey: string,
): Promise<CreateMapResult> {
  const [{ default: L }, { vectorBasemapLayer }] = await Promise.all([
    import("leaflet"),
    import("esri-leaflet-vector"),
  ]);

  const map = L.map(container, { minZoom: 2 }).setView(
    DEFAULT_CENTER,
    DEFAULT_ZOOM,
  );

  try {
    vectorBasemapLayer(ESRI_BASERMAP_ENUM, {
      apiKey: esriKey,
    }).addTo(map);
  } catch {
    // Non-fatal: map stays on default LA-wide view.
  }

  return { L, map };
}
