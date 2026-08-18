import { atom } from "nanostores";

/**
 * A target the system map should pan/zoom to.
 * Set by the sidebar (e.g. "nearby") and consumed by the SystemMap script.
 */
export interface SystemMapFlyTarget {
  lon: number;
  lat: number;
  zoom: number;
}

/**
 * `null` when no fly-to is pending. Each call to `flyToLocation` replaces the
 * previous target — the map listener calls `map.easeTo` and resets to `null`.
 */
export const systemMapFlyTarget = atom<SystemMapFlyTarget | null>(null);

/**
 * Sets a fly-to target for the system map. The SystemMap Astro component
 * listens to this store and animates the map to the given coordinates.
 */
export function flyToLocation(lon: number, lat: number, zoom = 15): void {
  systemMapFlyTarget.set({ lon, lat, zoom });
}
