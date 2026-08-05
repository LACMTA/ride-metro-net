import { atom } from "nanostores";
import type { RouteShapesGeoJSON, RouteShapeFeature } from "./getRouteShapes";

/**
 * The full GeoJSON shape data for the current route's line map.
 * Populated once after the `/api/route-shape/[routeId].json` fetch completes.
 * `null` until the fetch resolves (or if it fails).
 */
export const lineMapGeoJson = atom<RouteShapesGeoJSON | null>(null);

/**
 * The user's current selection within the line map controls.
 * Updated by the split-line, service-type, and direction `<select>` controls.
 */
export interface LineMapSelection {
  /** "core" (daytime) or "owl" (late-night) service. */
  serviceType: "core" | "owl";
  /** For split-line routes: the selected sub-line number, or `null`. */
  splitLineNumber: string | null;
  /** GTFS `direction_id` (0 or 1) for the selected trip. */
  directionId: number;
}

export const lineMapSelection = atom<LineMapSelection>({
  serviceType: "core",
  splitLineNumber: null,
  directionId: 0,
});

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

/** Sets the geojson payload and initializes the selection to defaults. */
export function setLineMapGeoJson(data: RouteShapesGeoJSON): void {
  lineMapGeoJson.set(data);

  // Initialize split-line to the first sub-line number found, if any.
  let splitLineNumber: string | null = null;
  if (data.isSplitline) {
    const firstNumber = data.features.find(
      (f) => f.properties.splitLineNumber !== undefined,
    )?.properties.splitLineNumber;
    splitLineNumber = firstNumber ?? null;
  }

  lineMapSelection.set({
    serviceType: "core",
    splitLineNumber,
    directionId: 0,
  });
}

export function setServiceType(serviceType: "core" | "owl"): void {
  const sel = lineMapSelection.get();
  lineMapSelection.set({ ...sel, serviceType, directionId: 0 });
}

export function setSplitLineNumber(splitLineNumber: string | null): void {
  const sel = lineMapSelection.get();
  lineMapSelection.set({
    ...sel,
    splitLineNumber,
    serviceType: "core",
    directionId: 0,
  });
}

export function setDirectionId(directionId: number): void {
  const sel = lineMapSelection.get();
  lineMapSelection.set({ ...sel, directionId });
}

// ---------------------------------------------------------------------------
// Shared filter utility
// ---------------------------------------------------------------------------

/**
 * Returns the features from `geojson` that match the current selection's
 * service type, split-line number, and direction. Used by both the MapLibre
 * map script and the React stop list to derive the visible shapes/stops.
 */
export function getFilteredShapes(
  geojson: RouteShapesGeoJSON,
  selection: LineMapSelection,
): RouteShapeFeature[] {
  return geojson.features.filter(
    (f) =>
      f.properties.serviceType === selection.serviceType &&
      (selection.splitLineNumber === null ||
        f.properties.splitLineNumber === selection.splitLineNumber) &&
      (f.properties.directionIds[0] ?? 0) === selection.directionId,
  );
}

/**
 * Returns the single feature corresponding to the current selection, or
 * `null` if no features match. If multiple features match (a data/config
 * error), the first is returned but the ambiguity should be investigated.
 */
export function getSelectedShape(
  geojson: RouteShapesGeoJSON,
  selection: LineMapSelection,
): RouteShapeFeature | null {
  const filtered = getFilteredShapes(geojson, selection);
  if (filtered.length === 0) return null;
  return filtered[0];
}
