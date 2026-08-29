import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@nanostores/react";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@headlessui/react";
import RouteBadge from "./RouteBadge";
import MapPinIcon from "./MapPinIcon";
import { getLineSlug } from "../lib/routeShortNameOverrides";
import type { RouteWithInfo } from "../lib/getRouteById";
import type {
  SystemMapData,
  SystemStation,
  SystemStationLine,
} from "../lib/getAllRouteShapes";
import type { BusStop } from "../lib/getBusStopsForBbox";
import { getData } from "../lib/getData";
import { ensureTilesLoaded } from "../lib/busStopTileCache";
import { gridXForLon, gridYForLat } from "../lib/busStopTiles";
import { haversineMeters } from "../lib/distance";
import {
  systemMapViewport,
  requestLocateMe,
  sidebarOpen,
} from "../lib/systemMapStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  lines: RouteWithInfo[];
  stops: BusStop[];
}

type SidebarMode = "browse" | "search";

/** Tab indices for the browse TabGroup. */
const TAB_LINES = 0;
const TAB_STOPS = 1;
const TAB_NEARBY = 2;

/**
 * Maximum distance (in meters) from the map center for a stop/station to be
 * considered "nearby". Tunable — small enough to feel like "near the center",
 * generous enough to return results in lower-density areas.
 */
const NEARBY_RADIUS_METERS = 600;

/** Maximum number of nearby stops to render. */
const NEARBY_STOP_LIMIT = 20;

/**
 * A stop near the map center — either a rail/busway station (from the
 * prerendered `stations` prop) or a bus stop (from the bus-stop tile cache).
 * Tagged with its haversine distance for sorting.
 */
interface NearbyStopEntry {
  distance: number;
  key: string;
  station?: SystemStation;
  busStop?: BusStop;
}

/** Result of a nearby computation: nearby lines + nearby stops (sorted). */
interface NearbyResult {
  lines: RouteWithInfo[];
  stops: NearbyStopEntry[];
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

const SUBHEADER_CLASS =
  "px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500";

const LIST_ITEM_CLASS = "flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50";

/**
 * Renders a single line as a list item with a RouteBadge and long name.
 * Links to the line detail page.
 */
function LineItem({ route }: { route: RouteWithInfo }) {
  const slug = getLineSlug(route.routeId);
  return (
    <a href={`/lines/${slug}/`} className={LIST_ITEM_CLASS}>
      <RouteBadge
        routeId={route.routeId}
        routeType={route.routeType}
        name={route.routeShortName}
        color={route.routeColor}
        textColor={route.routeTextColor}
        size="sm"
      />
      <span className="text-metro-text text-sm">
        {route.routeLongName || route.routeShortName}
      </span>
    </a>
  );
}

/**
 * Renders a single station as a list item with its name and serving line badges.
 * Links to the stop detail page.
 */
function StationItem({ station }: { station: SystemStation }) {
  return (
    <a href={`/stops/${station.stationId}/`} className={LIST_ITEM_CLASS}>
      <MapPinIcon className="h-5 shrink-0 text-gray-400" />
      <div className="flex flex-col gap-1">
        <span className="text-metro-text text-sm font-medium">
          {station.stopName}
        </span>
        {(station.lines.length > 0 || station.busRoutes.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {station.lines.map((line) => (
              <StationBadge key={`l-${line.routeId}`} line={line} />
            ))}
            {station.busRoutes.map((line) => (
              <StationBadge key={`b-${line.routeId}`} line={line} />
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

/** Small RouteBadge for a station line (non-link — rendered inside a row link). */
function StationBadge({ line }: { line: SystemStationLine }) {
  return (
    <RouteBadge
      routeId={line.routeId}
      routeType={line.routeType}
      name={line.routeShortName}
      color={line.routeColor}
      textColor={line.routeTextColor}
      size="sm"
    />
  );
}

/**
 * Renders a single bus stop (from search) as a list item with its
 * name and serving route badges. Links to the stop detail page.
 */
function StopItem({ stop }: { stop: BusStop }) {
  return (
    <a href={`/stops/${stop.stopId}/`} className={LIST_ITEM_CLASS}>
      <MapPinIcon className="h-5 shrink-0 text-gray-400" />
      <div className="flex flex-col gap-1">
        <span className="text-metro-text text-sm font-medium">
          {stop.stopName}
        </span>
        {stop.routes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stop.routes.map((route) => (
              <RouteBadge
                key={route.routeId}
                routeId={route.routeId}
                routeType={route.routeType}
                name={route.routeShortName}
                color={route.routeColor}
                textColor={route.routeTextColor}
                size="sm"
              />
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Results list (search)
// ---------------------------------------------------------------------------

function ResultsList({ results }: { results: SearchResult }) {
  const hasLines = results.lines.length > 0;
  const hasStops = results.stops.length > 0;

  if (!hasLines && !hasStops) {
    return (
      <p className="px-4 py-8 text-center text-gray-500">No results found.</p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {hasLines && (
        <>
          <h3 className={SUBHEADER_CLASS}>Lines</h3>
          {results.lines.map((route) => (
            <LineItem key={route.routeId} route={route} />
          ))}
        </>
      )}
      {hasStops && (
        <>
          <h3 className={SUBHEADER_CLASS}>Stops</h3>
          {results.stops.map((stop) => (
            <StopItem key={stop.stopId} stop={stop} />
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nearby list (browse "Nearby" tab)
// ---------------------------------------------------------------------------

/**
 * Renders the nearby lines and stops with "Lines" / "Stops" subheaders,
 * reusing the shared {@link LineItem}, {@link StationItem}, and {@link StopItem}
 * row components.
 */
function NearbyList({ result }: { result: NearbyResult }) {
  const hasLines = result.lines.length > 0;
  const hasStops = result.stops.length > 0;

  if (!hasLines && !hasStops) {
    return (
      <p className="px-4 py-8 text-center text-gray-500">
        No stops or lines found nearby. Drag the map to look elsewhere.
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {hasLines && (
        <>
          <h3 className={SUBHEADER_CLASS}>Lines</h3>
          {result.lines.map((route) => (
            <LineItem key={route.routeId} route={route} />
          ))}
        </>
      )}
      {hasStops && (
        <>
          <h3 className={SUBHEADER_CLASS}>Stops</h3>
          {result.stops.map((entry) =>
            entry.station ? (
              <StationItem key={entry.key} station={entry.station} />
            ) : (
              <StopItem key={entry.key} stop={entry.busStop!} />
            ),
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main sidebar component
// ---------------------------------------------------------------------------

interface SystemMapSidebarProps {
  /** All Metro lines (rail, busway, and bus) for the browse "Lines" tab. */
  lines: RouteWithInfo[];
}

export default function SystemMapSidebar({ lines }: SystemMapSidebarProps) {
  const [mode, setMode] = useState<SidebarMode>("browse");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active browse tab (0 = Lines, 1 = Stops, 2 = Nearby).
  const [activeTab, setActiveTab] = useState(TAB_LINES);

  // --- Stations (read from the embedded system-map payload) ---
  // Stations are deliberately not passed as island props — Astro serializes
  // island props into the HTML, which would duplicate the ~90 KB station list
  // already embedded as the page's `data-system-map` JSON payload (written by
  // SystemMap.astro's DataInjector). Instead it is read from the DOM after
  // mount — the same payload the map script reads. Starts as `null` so the
  // server render matches React's first client render (no hydration
  // mismatch).
  const [stations, setStations] = useState<SystemStation[] | null>(null);

  useEffect(() => {
    setStations(getData<SystemMapData>("data-system-map").stations);
  }, []);

  // --- Nearby tab state ---
  const [nearby, setNearby] = useState<NearbyResult | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // The system map publishes its center/zoom into this nanostore on `load` and
  // on every `moveend` (drag, zoom, programmatic pans). Like `lineMapStore`,
  // this atom is shared across the Astro `<script>` ↔ React `client:load`
  // boundary because Vite/Rollup dedupe `src/lib` modules into one chunk.
  const viewport = useStore(systemMapViewport);
  // True once we've ever triggered a locate from the Nearby tab, so the
  // jump-to-user-location only happens on the *first* selection.
  const hasTriggeredNearbyLocate = useRef(false);
  const nearbyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic id to ignore stale nearby computations.
  const nearbyReqIdRef = useRef(0);

  // (Computed inline in `computeNearby` via `lines.filter` to preserve order.)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic request id used to ignore stale search completions (e.g. a
  // search finishing after the user cleared the query or started a new one).
  const reqIdRef = useRef(0);

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  const fetchSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults(null);
      setLoading(false);
      setMode("browse");
      return;
    }

    setMode("search");
    setLoading(true);
    setError(null);

    // Cancel any in-flight request.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myId = ++reqIdRef.current;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Search request failed");
      const data = (await res.json()) as SearchResult;
      if (myId !== reqIdRef.current) return;
      setResults(data);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        if (myId !== reqIdRef.current) return;
        setError("Search failed. Please try again.");
      }
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, []);

  // Debounced search on query change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSearch]);

  // -------------------------------------------------------------------------
  // Nearby
  // -------------------------------------------------------------------------

  /**
   * Compute nearby lines and stops for a map center. Bus stops are pulled
   * from the shared bus-stop tile cache (3×3 tiles around the center — cache
   * hits are free since the map already loads these tiles on pan), rail/busway
   * stations come from the embedded station list. Both are filtered by haversine
   * distance to the center and sorted nearest-first. "Lines" are the routes
   * serving those nearby stops/stations, resolved to `RouteWithInfo` via the
   * `lines` prop (preserving its stable order).
   */
  const computeNearby = useCallback(
    async (center: { lon: number; lat: number }) => {
      const myId = ++nearbyReqIdRef.current;
      setNearbyLoading(true);

      try {
        // --- Bus stops: 3×3 tiles around the center ---
        const gx = gridXForLon(center.lon);
        const gy = gridYForLat(center.lat);
        const tileKeys: string[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            tileKeys.push(`${gx + dx},${gy + dy}`);
          }
        }
        const busStops = await ensureTilesLoaded(tileKeys);

        if (myId !== nearbyReqIdRef.current) return;

        // --- Nearby stops (bus + rail/busway stations) within radius ---
        const stopEntries: NearbyStopEntry[] = [];

        for (const stop of busStops) {
          const d = haversineMeters(center.lat, center.lon, stop.lat, stop.lon);
          if (d <= NEARBY_RADIUS_METERS) {
            stopEntries.push({ distance: d, key: stop.stopId, busStop: stop });
          }
        }

        for (const station of stations ?? []) {
          const d = haversineMeters(
            center.lat,
            center.lon,
            station.lat,
            station.lon,
          );
          if (d <= NEARBY_RADIUS_METERS) {
            stopEntries.push({
              distance: d,
              key: station.stationId,
              station,
            });
          }
        }

        stopEntries.sort((a, b) => a.distance - b.distance);
        const nearbyStops = stopEntries.slice(0, NEARBY_STOP_LIMIT);

        // --- Nearby lines: routes serving the nearby stops/stations ---
        const routeIdSet = new Set<string>();
        for (const entry of nearbyStops) {
          if (entry.station) {
            for (const l of entry.station.lines) routeIdSet.add(l.routeId);
            for (const l of entry.station.busRoutes) routeIdSet.add(l.routeId);
          } else if (entry.busStop) {
            for (const r of entry.busStop.routes) routeIdSet.add(r.routeId);
          }
        }
        // Preserve the `lines` prop order for stable, deduped line ordering.
        const nearbyLines = lines.filter((l) => routeIdSet.has(l.routeId));

        if (myId !== nearbyReqIdRef.current) return;
        setNearby({ lines: nearbyLines, stops: nearbyStops });
      } catch {
        if (myId !== nearbyReqIdRef.current) return;
        setNearby(null);
      } finally {
        if (myId === nearbyReqIdRef.current) setNearbyLoading(false);
      }
    },
    [lines, stations],
  );

  // Recompute nearby (debounced) when the viewport changes while the Nearby
  // tab is active. The map publishes the viewport on load and on `moveend`
  // (drag-end, zoom, programmatic pans), so this updates as the user drags.
  useEffect(() => {
    if (activeTab !== TAB_NEARBY) return;
    if (!viewport) return;

    if (nearbyDebounceRef.current) clearTimeout(nearbyDebounceRef.current);
    nearbyDebounceRef.current = setTimeout(() => {
      void computeNearby({ lon: viewport.lon, lat: viewport.lat });
    }, 250);
    return () => {
      if (nearbyDebounceRef.current) clearTimeout(nearbyDebounceRef.current);
    };
  }, [viewport, activeTab, computeNearby]);

  /** Controlled tab change: trigger locate the first time Nearby is selected. */
  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
    if (index === TAB_NEARBY && !hasTriggeredNearbyLocate.current) {
      hasTriggeredNearbyLocate.current = true;
      // Jump to the user's location, just like the find-me button. The map
      // re-publishes its viewport on `moveend` (after the pan), which
      // triggers the nearby computation above.
      setNearbyLoading(true);
      setNearby(null);
      requestLocateMe();
    }
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const showResults = mode === "search";

  return (
    <div className="bg-background-white flex h-full flex-col">
      {/* --- Search bar --- */}
      <div className="flex items-center gap-2 border-b border-gray-200 p-3">
        {/* Left-arrow close button — only on mobile (below md). Closes the
            drawer by writing to the shared `sidebarOpen` store, which the
            index.astro script listens to. */}
        <button
          type="button"
          onClick={() => sidebarOpen.set(false)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
          aria-label="Hide panel"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search stops and lines…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-divider-line focus:border-blue focus:ring-blue w-full rounded-md border py-2 pr-9 pl-3 text-sm outline-none focus:ring-1"
            aria-label="Search stops and lines"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults(null);
                setMode("browse");
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* --- Error message --- */}
      {error && (
        <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* --- Content area --- */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-4 py-8 text-center text-gray-500">Loading…</p>
        )}

        {!loading && showResults && results && (
          <ResultsList results={results} />
        )}

        {!loading && !showResults && (
          <TabGroup selectedIndex={activeTab} onChange={handleTabChange}>
            <TabList className="flex border-b border-gray-200">
              <Tab className="border-blue data-selected:text-metro-text px-4 py-2.5 text-sm text-gray-500 outline-none data-selected:border-b-2 data-selected:font-semibold">
                Lines
              </Tab>
              <Tab className="border-blue data-selected:text-metro-text px-4 py-2.5 text-sm text-gray-500 outline-none data-selected:border-b-2 data-selected:font-semibold">
                Stops
              </Tab>
              <Tab className="border-blue data-selected:text-metro-text px-4 py-2.5 text-sm text-gray-500 outline-none data-selected:border-b-2 data-selected:font-semibold">
                Nearby
              </Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <div className="divide-y divide-gray-100">
                  {lines.map((route) => (
                    <LineItem key={route.routeId} route={route} />
                  ))}
                </div>
              </TabPanel>
              <TabPanel>
                <div className="divide-y divide-gray-100">
                  {stations === null ? (
                    <p className="px-4 py-8 text-center text-gray-500">
                      Loading…
                    </p>
                  ) : (
                    stations.map((station) => (
                      <StationItem key={station.stationId} station={station} />
                    ))
                  )}
                </div>
              </TabPanel>
              <TabPanel>
                {nearbyLoading ? (
                  <p className="px-4 py-8 text-center text-gray-500">
                    {viewport ? "Loading nearby…" : "Locating…"}
                  </p>
                ) : nearby ? (
                  <NearbyList result={nearby} />
                ) : (
                  <p className="px-4 py-8 text-center text-gray-500">
                    {viewport
                      ? "No stops or lines found nearby. Drag the map to look elsewhere."
                      : "Locating your position…"}
                  </p>
                )}
              </TabPanel>
            </TabPanels>
          </TabGroup>
        )}
      </div>
    </div>
  );
}
