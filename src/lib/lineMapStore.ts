import { atom } from "nanostores";
import type {
  RouteShapesGeoJSON,
  RouteShapeFeature,
} from "./getRouteShapes";

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
  /** Index into the filtered features array (the "To:" / direction selector). */
  selectedIndex: number;
}

export const lineMapSelection = atom<LineMapSelection>({
  serviceType: "core",
  splitLineNumber: null,
  selectedIndex: 0,
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
    selectedIndex: 0,
  });
}

export function setServiceType(serviceType: "core" | "owl"): void {
  const sel = lineMapSelection.get();
  lineMapSelection.set({ ...sel, serviceType, selectedIndex: 0 });
}

export function setSplitLineNumber(splitLineNumber: string | null): void {
  const sel = lineMapSelection.get();
  lineMapSelection.set({
    ...sel,
    splitLineNumber,
    serviceType: "core",
    selectedIndex: 0,
  });
}

export function setSelectedIndex(selectedIndex: number): void {
  const sel = lineMapSelection.get();
  lineMapSelection.set({ ...sel, selectedIndex });
}

// ---------------------------------------------------------------------------
// Shared filter utility
// ---------------------------------------------------------------------------

/**
 * Returns the features from `geojson` that match the current selection's
 * service type and split-line number. Used by both the Leaflet map script
 * and the React stop list to derive the visible shapes/stops.
 */
export function getFilteredShapes(
  geojson: RouteShapesGeoJSON,
  selection: LineMapSelection,
): RouteShapeFeature[] {
  return geojson.features.filter(
    (f) =>
      f.properties.serviceType === selection.serviceType &&
      (selection.splitLineNumber === null ||
        f.properties.splitLineNumber === selection.splitLineNumber),
  );
}

/**
 * Returns the single feature corresponding to the current selection, or
 * `null` if no features match.
 */
export function getSelectedShape(
  geojson: RouteShapesGeoJSON,
  selection: LineMapSelection,
): RouteShapeFeature | null {
  const filtered = getFilteredShapes(geojson, selection);
  if (filtered.length === 0) return null;
  return filtered[selection.selectedIndex] ?? filtered[0];
}