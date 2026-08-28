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

// ---------------------------------------------------------------------------
// Current viewport (map → sidebar)
// ---------------------------------------------------------------------------

/**
 * The system map's current viewport. The SystemMap script publishes this on
 * `load` and on every `moveend` (which covers drag-end, zoom, and programmatic
 * `easeTo` pans). The sidebar reads it via `useStore` to compute "nearby".
 *
 * Like {@link systemMapFlyTarget}, this atom is shared across the Astro
 * `<script>` ↔ React `client:load` boundary: Vite/Rollup dedupe `src/lib`
 * modules into a single chunk imported by both bundles (see `lineMapStore` for
 * a proven cross-boundary precedent), so both sides reference the same atom
 * instance.
 */
export interface SystemMapViewport {
  lon: number;
  lat: number;
  zoom: number;
}

/** `null` until the map publishes its first viewport on `load`. */
export const systemMapViewport = atom<SystemMapViewport | null>(null);

// ---------------------------------------------------------------------------
// Locate (find-me) request
// ---------------------------------------------------------------------------

/**
 * Set to `true` by the sidebar (e.g. the "Nearby" tab) to request that the
 * system map locate the user — exactly the same behavior as tapping the
 * find-my-location button (geolocation + pan/zoom + "you are here" marker).
 *
 * The SystemMap script consumes the request, runs geolocation, and resets the
 * flag to `false` — mirroring the {@link systemMapFlyTarget} consume pattern so
 * a request made before the map finishes loading isn't lost.
 */
export const systemMapLocateRequest = atom<boolean>(false);

/** Request that the system map locate the user (same as the find-me button). */
export function requestLocateMe(): void {
  systemMapLocateRequest.set(true);
}

// ---------------------------------------------------------------------------
// Sidebar open/close (mobile only)
// ---------------------------------------------------------------------------

/**
 * Whether the mobile sidebar drawer is open. Written by the hamburger
 * toggle button (vanilla, in the SystemMap Astro markup) and by the
 * sidebar's left-arrow close button (React, in SystemMapSidebar), and read
 * by the index.astro script which translates the `<aside>` / toggles the
 * backdrop. Like the atoms above, this is shared across the Astro
 * `<script>` ↔ React `client:load` boundary via module dedup.
 *
 * On desktop (≥ md) the sidebar is always visible (`md:static`), so this
 * atom has no visual effect there.
 */
export const sidebarOpen = atom<boolean>(false);

/** Open or close the mobile sidebar drawer. */
export function setSidebarOpen(open: boolean): void {
  sidebarOpen.set(open);
}
