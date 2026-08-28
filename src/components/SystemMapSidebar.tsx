import { useState, useEffect, useCallback, useRef } from "react";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@headlessui/react";
import RouteBadge from "./RouteBadge";
import MapPinIcon from "./MapPinIcon";
import { getLineSlug, isBuswayRoute } from "../lib/routeShortNameOverrides";
import type { RouteWithInfo } from "../lib/getRouteById";
import type {
  SystemStation,
  SystemStationLine,
} from "../lib/getAllRouteShapes";
import type { BusStop } from "../lib/getBusStopsForBbox";
import { flyToLocation } from "../lib/systemMapStore";
import { gridXForLon, gridYForLat } from "../lib/busStopTiles";
import { ensureTilesLoaded } from "../lib/busStopTileCache";
import { haversineMeters } from "../lib/distance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  lines: RouteWithInfo[];
  stops: BusStop[];
}

type SidebarMode = "browse" | "search" | "nearby";

// ---------------------------------------------------------------------------
// Frontend "nearby" computation
// ---------------------------------------------------------------------------
//
// Instead of hitting the SSR `/api/nearby` endpoint (which runs a live SQLite
// query), nearby stops are computed on the client from:
//   1. prerendered bus-stop tiles (served via CDN, cached in
//      `busStopTileCache` and shared with the system map), and
//   2. the rail/busway stations already passed to this sidebar.
//
// This keeps the data 1:1 with the old endpoint (the tiles use the same
// eligibility + busway-exclusion logic), removes DB load from the nearby
// path, and reuses tiles that are likely already loaded for the map.

/** Maximum number of nearby stops to return (matches the old endpoint). */
const NEARBY_LIMIT = 30;

/** Initial tile ring around the user (3×3 grid ≈ 6.6 km). */
const NEARBY_INIT_RING = 1;
/** Maximum tile ring to expand to if the initial ring has too few stops
 *  (5×5 grid ≈ 11 km — always enough in the LA service area). */
const NEARBY_MAX_RING = 2;

/** Tile keys for a square ring of tiles centered on a coordinate. */
function tileKeysAround(lat: number, lon: number, ring: number): string[] {
  const cx = gridXForLon(lon);
  const cy = gridYForLat(lat);
  const keys: string[] = [];
  for (let gx = cx - ring; gx <= cx + ring; gx++) {
    for (let gy = cy - ring; gy <= cy + ring; gy++) {
      keys.push(`${gx},${gy}`);
    }
  }
  return keys;
}

/**
 * Converts a rail/busway station into the `BusStop` shape used by the
 * results list. Only the station's system-map `lines` are carried as route
 * badges (mirroring the old endpoint, which enriched parent stations with
 * their rail routes — regular bus routes are `[]` for rail stations).
 */
function stationToBusStop(station: SystemStation): BusStop {
  return {
    stopId: station.stationId,
    stopName: station.stopName,
    lat: station.lat,
    lon: station.lon,
    routes: station.lines.map((line) => ({
      routeId: line.routeId,
      routeShortName: line.routeShortName,
      routeType: line.routeType,
      routeColor: line.routeColor,
      routeTextColor: line.routeTextColor,
    })),
  };
}

/**
 * Computes the nearest stops to a coordinate on the frontend.
 *
 * Bus stops come from bus-stop tiles; rail stations come from `stations`
 * (excluding pure-busway stations, matching the old endpoint's busway
 * exclusion). Both sources are merged, sorted by haversine distance, and
 * the nearest `NEARBY_LIMIT` are returned. A deduplicated route list is
 * built for the "Lines" subheader.
 */
async function computeNearby(
  lat: number,
  lon: number,
  stations: SystemStation[],
): Promise<SearchResult> {
  // Rail/busway station candidates, excluding pure-busway stations.
  const railStations = stations
    .filter((s) => !s.lines.every((line) => isBuswayRoute(line.routeId)))
    .map(stationToBusStop);

  async function gatherCandidates(ring: number): Promise<BusStop[]> {
    const tileStops = await ensureTilesLoaded(tileKeysAround(lat, lon, ring));
    const seen = new Set<string>();
    const merged: BusStop[] = [];
    for (const stop of [...tileStops, ...railStations]) {
      if (seen.has(stop.stopId)) continue;
      seen.add(stop.stopId);
      merged.push(stop);
    }
    return merged;
  }

  let candidates = await gatherCandidates(NEARBY_INIT_RING);
  if (candidates.length < NEARBY_LIMIT) {
    candidates = await gatherCandidates(NEARBY_MAX_RING);
  }

  const stops = candidates
    .map((stop) => ({
      stop,
      dist: haversineMeters(lat, lon, stop.lat, stop.lon),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, NEARBY_LIMIT)
    .map((entry) => entry.stop);

  // Deduplicate routes across the returned stops for the "Lines" subheader.
  const seenRouteIds = new Set<string>();
  const lines: RouteWithInfo[] = [];
  for (const stop of stops) {
    for (const route of stop.routes) {
      if (seenRouteIds.has(route.routeId)) continue;
      seenRouteIds.add(route.routeId);
      lines.push({
        routeId: route.routeId,
        routeShortName: route.routeShortName,
        // routeLongName isn't available from tile/station route info; the
        // sidebar displays the badge + short name only (matches old endpoint).
        routeLongName: "",
        routeType: route.routeType,
        routeColor: route.routeColor,
        routeTextColor: route.routeTextColor,
        defaultLineColor: "",
      });
    }
  }

  return { stops, lines };
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
 * Renders a single bus stop (from search/nearby) as a list item with its
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
// Results list (search / nearby)
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
// Main sidebar component
// ---------------------------------------------------------------------------

interface SystemMapSidebarProps {
  /** All Metro lines (rail, busway, and bus) for the browse "Lines" tab. */
  lines: RouteWithInfo[];
  /** Rail and busway stations for the browse "Stops" tab. */
  stations: SystemStation[];
}

export default function SystemMapSidebar({
  lines,
  stations,
}: SystemMapSidebarProps) {
  const [mode, setMode] = useState<SidebarMode>("browse");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic request id used to ignore stale nearby/search completions
  // (e.g. a nearby search finishing after the user switched back to browse or
  // started a text search). Nearby no longer uses an AbortController since it
  // reads prerendered tiles instead of a cancellable fetch.
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

    // Cancel any in-flight request and invalidate any pending nearby result.
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

  const handleNearby = useCallback(() => {
    // If already in nearby mode, toggle back to browse.
    if (mode === "nearby") {
      ++reqIdRef.current;
      setMode("browse");
      setResults(null);
      setQuery("");
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setMode("nearby");
    setLoading(true);
    setError(null);
    setQuery("");

    // Cancel any in-flight text search; this nearby request is not abortable
    // (it reads prerendered tiles), so a request id guards stale completions.
    abortRef.current?.abort();
    const myId = ++reqIdRef.current;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // Pan and zoom the system map to the user's location.
        flyToLocation(longitude, latitude);

        if (myId !== reqIdRef.current) return;

        try {
          const data = await computeNearby(latitude, longitude, stations);
          if (myId !== reqIdRef.current) return;
          setResults(data);
        } catch {
          if (myId !== reqIdRef.current) return;
          setError("Failed to find nearby stops.");
        } finally {
          if (myId === reqIdRef.current) setLoading(false);
        }
      },
      (err) => {
        if (myId !== reqIdRef.current) return;
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied.");
        } else {
          setError("Unable to determine your location.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, [mode, stations]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isNearby = mode === "nearby";
  const showResults = mode === "search" || mode === "nearby";

  return (
    <div className="bg-background-white flex h-full flex-col">
      {/* --- Search bar --- */}
      <div className="flex items-center gap-2 border-b border-gray-200 p-3">
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
        <button
          onClick={handleNearby}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
            isNearby
              ? "border-blue bg-blue text-white"
              : "border-divider-line text-metro-text hover:bg-gray-50"
          }`}
          aria-label="Find nearby stops"
          title="Find nearby stops"
        >
          <MapPinIcon className="h-5" />
        </button>
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
          <TabGroup>
            <TabList className="flex border-b border-gray-200">
              <Tab className="border-blue data-selected:text-metro-text px-4 py-2.5 text-sm text-gray-500 outline-none data-selected:border-b-2 data-selected:font-semibold">
                Lines
              </Tab>
              <Tab className="border-blue data-selected:text-metro-text px-4 py-2.5 text-sm text-gray-500 outline-none data-selected:border-b-2 data-selected:font-semibold">
                Stops
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
                  {stations.map((station) => (
                    <StationItem key={station.stationId} station={station} />
                  ))}
                </div>
              </TabPanel>
            </TabPanels>
          </TabGroup>
        )}
      </div>
    </div>
  );
}
