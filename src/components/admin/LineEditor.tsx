import { useEffect, useMemo, useRef, useState } from "react";
import AdminLineMap from "./AdminLineMap";
import ConfigPanel, { matchesConfigFilter } from "./ConfigPanel";
import TripLabels from "./TripLabels";
import type {
  ConfigTripFilter,
  AdminLineDetail,
  AdminLineSummary,
  AdminSaveResponse,
  AdminTripInfo,
  StopDisplayMode,
} from "../../lib/admin/types";
import type { LineMapTripConfig } from "../../data/types";
import { getLineSlug } from "../../lib/routeShortNameOverrides";

const SELECT_CLASS = "border-divider-line rounded border px-2 py-1";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Empty configured-trips filter (no filtering on any dimension). */
const NO_CONFIG_FILTER: ConfigTripFilter = {
  splitLineNumber: null,
  directionId: null,
  serviceType: null,
};

/**
 * Normalizes a trip config to the canonical shape used for dirty checks
 * and saves: `serviceType` always set, optional fields present only when
 * non-empty. Key order is fixed so JSON.stringify comparisons are stable.
 */
function normalizeTrip(trip: LineMapTripConfig): LineMapTripConfig {
  const out: LineMapTripConfig = {
    tripId: trip.tripId,
    directionId: trip.directionId,
    serviceType: trip.serviceType ?? "core",
  };
  if (trip.splitLineNumber) out.splitLineNumber = trip.splitLineNumber;
  if (trip.stopHeadsignFilter) out.stopHeadsignFilter = trip.stopHeadsignFilter;
  return out;
}

/** fetch + JSON helper that surfaces API validation errors as messages. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body — fall through to the status-based message.
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (
      body !== null &&
      typeof body === "object" &&
      Array.isArray((body as { errors?: unknown }).errors)
    ) {
      const errors = (body as { errors: string[] }).errors;
      if (errors.length > 0) message = errors.join("\n");
    }
    throw new Error(message);
  }
  return body as T;
}

interface LineEditorProps {
  /** ESRI basemap key, read server-side by the page and passed in. */
  esriKey: string;
}

/**
 * Dev-only island for /admin/lines: pick a line, browse every candidate
 * trip on a map, and edit the trips saved to src/data/lineMapTrips.json.
 * All data is fetched at runtime from /admin/api/lines*.
 */
export default function LineEditor({ esriKey }: LineEditorProps) {
  const [lines, setLines] = useState<AdminLineSummary[] | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminLineDetail | null>(null);
  const [baseline, setBaseline] = useState<LineMapTripConfig[]>([]);
  const [draft, setDraft] = useState<LineMapTripConfig[]>([]);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [stopDisplay, setStopDisplay] = useState<StopDisplayMode>("all");
  const [configFilter, setConfigFilter] =
    useState<ConfigTripFilter>(NO_CONFIG_FILTER);
  const [hiddenShapeIds, setHiddenShapeIds] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tracks the latest selection so stale detail responses can be dropped.
  const routeIdRef = useRef<string | null>(null);
  routeIdRef.current = routeId;

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const tripsById = useMemo(() => {
    const map = new Map<string, AdminTripInfo>();
    for (const trip of detail?.trips ?? []) map.set(trip.tripId, trip);
    return map;
  }, [detail]);

  /** Shape IDs serving each stop, from the candidate trips' patterns. */
  const shapesByStopId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!detail) return map;
    for (const trip of detail.trips) {
      for (const stopId of detail.stopIdPatterns[trip.stopPatternKey] ?? []) {
        let shapes = map.get(stopId);
        if (!shapes) {
          shapes = new Set();
          map.set(stopId, shapes);
        }
        shapes.add(trip.shapeId);
      }
    }
    return map;
  }, [detail]);

  /** Stop IDs covered by the draft config (union of its trips' patterns). */
  const coveredStopIds = useMemo(() => {
    const ids = new Set<string>();
    if (!detail) return ids;
    for (const trip of draft) {
      const info = tripsById.get(trip.tripId);
      if (!info) continue;
      for (const stopId of detail.stopIdPatterns[info.stopPatternKey] ?? []) {
        ids.add(stopId);
      }
    }
    return ids;
  }, [detail, draft, tripsById]);

  const coveredCount = useMemo(
    () =>
      detail?.stops.filter((stop) => coveredStopIds.has(stop.stopId)).length ??
      0,
    [detail, coveredStopIds],
  );

  /**
   * The configured-trips filter with values the draft no longer contains
   * dropped, so removed trips can't leave a stale selection behind.
   */
  const effectiveConfigFilter = useMemo(() => {
    const splitLineNumber =
      configFilter.splitLineNumber !== null &&
      draft.some((t) => t.splitLineNumber === configFilter.splitLineNumber)
        ? configFilter.splitLineNumber
        : null;
    const directionId =
      configFilter.directionId !== null &&
      draft.some((t) => t.directionId === configFilter.directionId)
        ? configFilter.directionId
        : null;
    const serviceType =
      configFilter.serviceType !== null &&
      draft.some((t) => (t.serviceType ?? "core") === configFilter.serviceType)
        ? configFilter.serviceType
        : null;
    return { splitLineNumber, directionId, serviceType };
  }, [draft, configFilter]);

  /** Shape IDs used by any draft trip (checkmarks on the shape labels). */
  const configuredShapeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const trip of draft) {
      const info = tripsById.get(trip.tripId);
      if (info) ids.add(info.shapeId);
    }
    return ids;
  }, [draft, tripsById]);

  /**
   * Shape IDs of draft trips matching the configured-trips filter —
   * drawn as selected lines, so an active filter behaves like the line
   * page's controls and isolates that combination on the map.
   */
  const selectedShapeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const trip of draft) {
      if (!matchesConfigFilter(trip, effectiveConfigFilter)) continue;
      const info = tripsById.get(trip.tripId);
      if (info) ids.add(info.shapeId);
    }
    return ids;
  }, [draft, effectiveConfigFilter, tripsById]);

  const selectedLine = lines?.find((l) => l.routeId === routeId) ?? null;
  const selectedIndex = lines?.findIndex((l) => l.routeId === routeId) ?? -1;

  /** Loads one line's editor data; drops the response if the user moved on. */
  async function loadLine(nextRouteId: string): Promise<void> {
    setLoadError(null);
    setSaveState("idle");
    setSaveError(null);
    setHoveredShapeId(null);
    setStopDisplay("all");
    setConfigFilter(NO_CONFIG_FILTER);
    setHiddenShapeIds(new Set());
    setDetail(null);
    try {
      const nextDetail = await fetchJson<AdminLineDetail>(
        `/admin/api/lines/${encodeURIComponent(nextRouteId)}`,
      );
      if (routeIdRef.current !== nextRouteId) return;
      const config = (nextDetail.config ?? []).map(normalizeTrip);
      setDetail(nextDetail);
      setBaseline(config);
      setDraft(config.map((t) => ({ ...t })));
    } catch (e) {
      if (routeIdRef.current === nextRouteId) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  /** Selects a line, guarding against discarding unsaved changes. */
  function selectLine(nextRouteId: string): void {
    if (routeId === nextRouteId) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setRouteId(nextRouteId);
  }

  // Initial load: line list, then the ?routeId= line (or the first).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchJson<{ lines: AdminLineSummary[] }>(
          "/admin/api/lines",
        );
        setLines(res.lines);
        const wanted = new URLSearchParams(window.location.search).get(
          "routeId",
        );
        const initial =
          res.lines.find((l) => l.routeId === wanted)?.routeId ??
          res.lines[0]?.routeId ??
          null;
        if (initial) setRouteId(initial);
        else setLoadError("No lines found.");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // Load the selected line whenever the selection changes.
  useEffect(() => {
    if (routeId) void loadLine(routeId);
  }, [routeId]);

  // Keep the URL in sync so a line selection survives reloads.
  useEffect(() => {
    if (routeId) {
      window.history.replaceState(
        null,
        "",
        `/admin/lines?routeId=${encodeURIComponent(routeId)}`,
      );
    }
  }, [routeId]);

  // Warn before losing unsaved changes to a page reload/close.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // --- Draft mutations ---

  function updateTrip(index: number, patch: Partial<LineMapTripConfig>): void {
    setDraft((prev) =>
      prev.map((trip, i) => {
        if (i !== index) return trip;
        const merged = { ...trip, ...patch };
        // Treat cleared optional fields as absent.
        if (
          patch.splitLineNumber !== undefined &&
          patch.splitLineNumber.trim() === ""
        ) {
          delete merged.splitLineNumber;
        }
        if (
          patch.stopHeadsignFilter !== undefined &&
          patch.stopHeadsignFilter.trim() === ""
        ) {
          delete merged.stopHeadsignFilter;
        }
        return normalizeTrip(merged);
      }),
    );
  }

  /**
   * The shape label's + button: removes any draft trips using that shape
   * when configured, or — when none — adds the shape's representative
   * trip (chosen by TripLabels with the seed script's most-stops
   * heuristic), defaulting serviceType from its owl hint.
   */
  function toggleShape(shapeId: string, representative: AdminTripInfo): void {
    setDraft((prev) => {
      const onShape = prev.some(
        (t) => tripsById.get(t.tripId)?.shapeId === shapeId,
      );
      if (onShape) {
        return prev.filter((t) => tripsById.get(t.tripId)?.shapeId !== shapeId);
      }
      return [
        ...prev,
        normalizeTrip({
          tripId: representative.tripId,
          directionId: representative.directionId ?? 0,
          serviceType: representative.owlHint,
        }),
      ];
    });
  }

  /** Label body click: toggles one shape's visibility on the map. */
  function toggleShapeVisibility(shapeId: string): void {
    setHiddenShapeIds((prev) => {
      const next = new Set(prev);
      if (next.has(shapeId)) next.delete(shapeId);
      else next.add(shapeId);
      return next;
    });
  }

  /** The shape field's hide-all / show-all buttons. */
  function setAllShapesHidden(hidden: boolean): void {
    if (!detail) return;
    setHiddenShapeIds(
      hidden ? new Set(detail.shapes.map((s) => s.shapeId)) : new Set(),
    );
  }

  /**
   * The stop popup's button: hide every shape whose trips don't serve the
   * clicked stop, reusing the label field's hidden-shapes mechanism so
   * the labels dim in step with the map and "Show all" clears it.
   */
  function showOnlyShapesServingStop(stopId: string): void {
    if (!detail) return;
    const serving = shapesByStopId.get(stopId);
    setHiddenShapeIds(
      new Set(
        detail.shapes
          .map((s) => s.shapeId)
          .filter((shapeId) => !serving?.has(shapeId)),
      ),
    );
  }

  function removeTrip(index: number): void {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function addManual(): void {
    setDraft((prev) => [
      ...prev,
      normalizeTrip({ tripId: "", directionId: 0, serviceType: "core" }),
    ]);
  }

  // --- Save ---

  async function save(): Promise<void> {
    if (!routeId) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetchJson<AdminSaveResponse>(
        `/admin/api/lines/${encodeURIComponent(routeId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trips: draft }),
        },
      );
      const saved = res.trips.map(normalizeTrip);
      setBaseline(saved);
      setDraft(saved.map((t) => ({ ...t })));
      setSaveState("saved");
      setLines(
        (prev) =>
          prev?.map((l) =>
            l.routeId === routeId
              ? {
                  ...l,
                  hasConfig: saved.length > 0,
                  configTripCount: saved.length,
                }
              : l,
          ) ?? null,
      );
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  // --- Render ---

  if (!lines || (loadError && !routeId)) {
    return (
      <div className="m-auto w-11/12 max-w-7xl py-8">
        {loadError ? (
          <p className="text-error font-bold">Failed to load: {loadError}</p>
        ) : (
          <p className="text-secondary-text">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="m-auto w-11/12 max-w-7xl py-6">
      {/* Line selector */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={SELECT_CLASS}
          disabled={selectedIndex <= 0}
          onClick={() => selectLine(lines[selectedIndex - 1].routeId)}
        >
          ← Prev
        </button>
        <select
          className={SELECT_CLASS + " min-w-40"}
          value={routeId ?? ""}
          onChange={(e) => selectLine(e.target.value)}
        >
          {lines.map((line) => (
            <option key={line.routeId} value={line.routeId}>
              {line.label}
              {line.routeType !== 3 ? " Line" : ""} ({line.routeId}) —{" "}
              {line.hasConfig
                ? `${line.configTripCount} trips`
                : "unconfigured"}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={SELECT_CLASS}
          disabled={selectedIndex >= lines.length - 1}
          onClick={() => selectLine(lines[selectedIndex + 1].routeId)}
        >
          Next →
        </button>
        {selectedLine && (
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: selectedLine.lineColor }}
            />
            <span className="font-bold">
              {selectedLine.longName || selectedLine.label}
            </span>
          </span>
        )}
        {/* Dev-only shortcut: the live line page re-renders on request with
            the saved config, so save here then refresh there to verify. */}
        {selectedLine && selectedLine.hasConfig && (
          <a
            className="border-blue text-blue hover:bg-light-blue rounded-sm border px-2 py-1 text-sm"
            href={`/lines/${getLineSlug(selectedLine.routeId)}/`}
            target="_blank"
            rel="noreferrer"
          >
            Show public page ↗
          </a>
        )}
        {dirty && (
          <span className="border-blue text-blue rounded-sm border px-2 py-0.5 text-sm">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Editor body */}
      {loadError ? (
        <p className="text-error mt-8 font-bold">Failed to load: {loadError}</p>
      ) : detail ? (
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AdminLineMap
              key={routeId}
              esriKey={esriKey}
              lineColor={detail.line.lineColor}
              shapes={detail.shapes}
              stops={detail.stops}
              coveredStopIds={coveredStopIds}
              selectedShapeIds={selectedShapeIds}
              hoveredShapeId={hoveredShapeId}
              hiddenShapeIds={hiddenShapeIds}
              stopDisplay={stopDisplay}
              onFilterByStop={showOnlyShapesServingStop}
            />
            <TripLabels
              shapes={detail.shapes}
              trips={detail.trips}
              selectedShapeIds={configuredShapeIds}
              hiddenShapeIds={hiddenShapeIds}
              hoveredShapeId={hoveredShapeId}
              onHover={setHoveredShapeId}
              onToggleShape={toggleShape}
              onToggleVisibility={toggleShapeVisibility}
              onSetAllHidden={setAllShapesHidden}
            />
          </div>
          <div className="lg:sticky lg:top-4">
            <ConfigPanel
              draftTrips={draft}
              detail={detail}
              coveredCount={coveredCount}
              totalStops={detail.stops.length}
              stopDisplay={stopDisplay}
              onStopDisplayChange={setStopDisplay}
              configFilter={effectiveConfigFilter}
              onConfigFilterChange={setConfigFilter}
              hoveredShapeId={hoveredShapeId}
              onHoverShape={setHoveredShapeId}
              onChangeTrip={updateTrip}
              onRemoveTrip={removeTrip}
              onAddManual={addManual}
              dirty={dirty}
              saveState={saveState}
              saveError={saveError}
              onSave={save}
            />
          </div>
        </div>
      ) : (
        <p className="text-secondary-text mt-8">Loading line…</p>
      )}
    </div>
  );
}
