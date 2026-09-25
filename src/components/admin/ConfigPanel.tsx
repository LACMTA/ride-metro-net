import { useMemo } from "react";
import type {
  AdminLineDetail,
  ConfigTripFilter,
  StopDisplayMode,
} from "../../lib/admin/types";
import type { LineMapTripConfig } from "../../data/types";

interface Props {
  draftTrips: LineMapTripConfig[];
  /**
   * Full line detail: trips for the known-in-database flags, and the
   * stop patterns + stops for the direction selector's terminal labels.
   */
  detail: AdminLineDetail;
  /** Stop-coverage numbers for the current draft. */
  coveredCount: number;
  totalStops: number;
  /** Which stops the map renders: only coverage gaps, all, or none. */
  stopDisplay: StopDisplayMode;
  onStopDisplayChange: (mode: StopDisplayMode) => void;
  /**
   * Active configured-trips filter. Values are reconciled with the
   * draft by the parent, so stale selections are already dropped.
   */
  configFilter: ConfigTripFilter;
  onConfigFilterChange: (filter: ConfigTripFilter) => void;
  /** Shape highlighted on the map; a row highlights when its trip uses it. */
  hoveredShapeId: string | null;
  onHoverShape: (shapeId: string | null) => void;
  onChangeTrip: (index: number, patch: Partial<LineMapTripConfig>) => void;
  onRemoveTrip: (index: number) => void;
  onAddManual: () => void;
  dirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  onSave: () => void;
}

const INPUT_CLASS = "border-divider-line rounded border px-2 py-1";
const SELECT_CLASS = INPUT_CLASS;

/**
 * Whether a trip matches the configured-trips filter (null dimensions
 * pass). Shared by this panel's row filtering and by LineEditor's
 * map selected-lines computation.
 */
export function matchesConfigFilter(
  trip: LineMapTripConfig,
  filter: ConfigTripFilter,
): boolean {
  if (
    filter.splitLineNumber !== null &&
    (trip.splitLineNumber ?? "") !== filter.splitLineNumber
  ) {
    return false;
  }
  if (filter.directionId !== null && trip.directionId !== filter.directionId) {
    return false;
  }
  if (
    filter.serviceType !== null &&
    (trip.serviceType ?? "core") !== filter.serviceType
  ) {
    return false;
  }
  return true;
}

/**
 * Dev-only: the right-hand panel of the line editor. Lists the trips in
 * the draft config with per-trip editing (tripId, direction, service
 * type, and the optional split-line / headsign-filter fields), a
 * split / service / direction filter (mirroring the line page's
 * LineMapControls), the stop-coverage summary, and the save button.
 */
export default function ConfigPanel({
  draftTrips,
  detail,
  coveredCount,
  totalStops,
  stopDisplay,
  onStopDisplayChange,
  configFilter,
  onConfigFilterChange,
  hoveredShapeId,
  onHoverShape,
  onChangeTrip,
  onRemoveTrip,
  onAddManual,
  dirty,
  saveState,
  saveError,
  onSave,
}: Props) {
  const tripsById = useMemo(
    () => new Map(detail.trips.map((t) => [t.tripId, t])),
    [detail.trips],
  );
  const stopNamesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const stop of detail.stops) map.set(stop.stopId, stop.stopName);
    return map;
  }, [detail.stops]);

  // Filter options, derived from the draft config — like LineMapControls,
  // the split selector only appears for split-line configs and the
  // service selector only when core and owl are both present.
  const splitOptions = useMemo(
    () =>
      [...new Set(draftTrips.map((t) => t.splitLineNumber))]
        .filter((n): n is string => Boolean(n))
        .sort(),
    [draftTrips],
  );
  const serviceTypes = useMemo(
    () => [...new Set(draftTrips.map((t) => t.serviceType ?? "core"))].sort(),
    [draftTrips],
  );
  const directionIds = useMemo(
    () =>
      [...new Set(draftTrips.map((t) => t.directionId))].sort((a, b) => a - b),
    [draftTrips],
  );

  // Direction options narrow with the split/service selection and are
  // labeled with the matching trip's terminal stop, like the line page's
  // "To:" selector.
  const directionOptions = useMemo(() => {
    const labels = new Map<number, string>();
    for (const trip of draftTrips) {
      if (
        configFilter.splitLineNumber !== null &&
        (trip.splitLineNumber ?? "") !== configFilter.splitLineNumber
      ) {
        continue;
      }
      if (
        configFilter.serviceType !== null &&
        (trip.serviceType ?? "core") !== configFilter.serviceType
      ) {
        continue;
      }
      if (labels.has(trip.directionId)) continue;
      const info = tripsById.get(trip.tripId);
      const pattern = info
        ? (detail.stopIdPatterns[info.stopPatternKey] ?? [])
        : [];
      const lastStopId = pattern.at(-1);
      labels.set(
        trip.directionId,
        lastStopId ? (stopNamesById.get(lastStopId) ?? "") : "",
      );
    }
    return [...labels.entries()].sort((a, b) => a[0] - b[0]);
  }, [
    draftTrips,
    configFilter,
    tripsById,
    detail.stopIdPatterns,
    stopNamesById,
  ]);

  // Visible rows keep their index in the draft so edits/removals target
  // the right trip.
  const visibleTrips = useMemo(
    () =>
      draftTrips
        .map((trip, index) => ({ trip, index }))
        .filter(({ trip }) => matchesConfigFilter(trip, configFilter)),
    [draftTrips, configFilter],
  );

  const showFilterRow =
    splitOptions.length > 0 ||
    serviceTypes.length > 1 ||
    directionIds.length > 1;

  const uncovered = totalStops - coveredCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border-light rounded-md border bg-white p-4">
        <h2 className="mb-2 font-bold">Configured trips</h2>
        <p className="text-secondary-text text-sm">
          {coveredCount} of {totalStops} stops covered
          {uncovered > 0 && (
            <span className="text-error font-bold">
              {" "}
              · {uncovered} uncovered
            </span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-secondary-text">Stops:</span>
          {(["uncovered", "all", "none"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onStopDisplayChange(mode)}
              className={
                "rounded-sm border px-2 py-0.5 " +
                (mode === stopDisplay
                  ? "border-blue bg-light-blue text-metro-text font-bold"
                  : "border-border-light text-secondary-text hover:text-metro-text bg-white")
              }
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="border-border-light divide-border-light divide-y rounded-md border bg-white">
        {showFilterRow && (
          <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
            {splitOptions.length > 0 && (
              <label className="flex items-center gap-1">
                <span className="text-secondary-text">Split:</span>
                <select
                  className={SELECT_CLASS}
                  value={configFilter.splitLineNumber ?? ""}
                  onChange={(e) =>
                    onConfigFilterChange({
                      ...configFilter,
                      splitLineNumber: e.target.value || null,
                    })
                  }
                >
                  <option value="">All</option>
                  {splitOptions.map((num) => (
                    <option key={num} value={num}>
                      {num}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {serviceTypes.length > 1 && (
              <label className="flex items-center gap-1">
                <span className="text-secondary-text">Service:</span>
                <select
                  className={SELECT_CLASS}
                  value={configFilter.serviceType ?? ""}
                  onChange={(e) =>
                    onConfigFilterChange({
                      ...configFilter,
                      serviceType:
                        e.target.value === ""
                          ? null
                          : (e.target.value as "core" | "owl"),
                    })
                  }
                >
                  <option value="">All</option>
                  {serviceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {directionIds.length > 1 && (
              <label className="flex items-center gap-1">
                <span className="text-secondary-text">Direction:</span>
                <select
                  className={SELECT_CLASS}
                  value={
                    configFilter.directionId === null
                      ? ""
                      : String(configFilter.directionId)
                  }
                  onChange={(e) =>
                    onConfigFilterChange({
                      ...configFilter,
                      directionId:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">All</option>
                  {directionOptions.map(([dirId, terminal]) => (
                    <option key={dirId} value={dirId}>
                      {dirId}
                      {terminal ? ` — ${terminal}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {draftTrips.length === 0 && (
          <p className="text-secondary-text p-4 text-sm">
            No trips configured. Click a shape label below the map to add one.
          </p>
        )}
        {draftTrips.length > 0 && visibleTrips.length === 0 && (
          <p className="text-secondary-text p-4 text-sm">
            No trips match the current filter.
          </p>
        )}
        {visibleTrips.map(({ trip, index }) => {
          const known = tripsById.has(trip.tripId);
          const hovered =
            hoveredShapeId !== null &&
            tripsById.get(trip.tripId)?.shapeId === hoveredShapeId;
          return (
            <div
              key={index}
              className={"p-3" + (hovered ? " bg-gray-100" : "")}
              onMouseEnter={() =>
                onHoverShape(tripsById.get(trip.tripId)?.shapeId ?? null)
              }
              onMouseLeave={() => onHoverShape(null)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={INPUT_CLASS + " min-w-48 flex-1 font-mono text-xs"}
                  value={trip.tripId}
                  placeholder="tripId"
                  onChange={(e) =>
                    onChangeTrip(index, { tripId: e.target.value })
                  }
                />
                <select
                  className={SELECT_CLASS}
                  value={String(trip.directionId)}
                  onChange={(e) =>
                    onChangeTrip(index, { directionId: Number(e.target.value) })
                  }
                >
                  <option value="0">dir 0</option>
                  <option value="1">dir 1</option>
                </select>
                <select
                  className={SELECT_CLASS}
                  value={trip.serviceType ?? "core"}
                  onChange={(e) =>
                    onChangeTrip(index, {
                      serviceType: e.target.value as "core" | "owl",
                    })
                  }
                >
                  <option value="core">core</option>
                  <option value="owl">owl</option>
                </select>
                <button
                  type="button"
                  className="border-error text-error rounded-sm border px-2 py-1 text-sm"
                  onClick={() => onRemoveTrip(index)}
                  aria-label="Remove trip"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <span className="text-secondary-text">split:</span>
                  <input
                    className={INPUT_CLASS + " w-16"}
                    value={trip.splitLineNumber ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      onChangeTrip(index, { splitLineNumber: e.target.value })
                    }
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-secondary-text">headsign filter:</span>
                  <input
                    className={INPUT_CLASS + " w-24"}
                    value={trip.stopHeadsignFilter ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      onChangeTrip(index, {
                        stopHeadsignFilter: e.target.value,
                      })
                    }
                  />
                </label>
                {!known && (
                  <span className="text-error text-xs font-bold">
                    ⚠ not in database
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div className="p-3">
          <button
            type="button"
            className="border-blue text-blue rounded-sm border px-2 py-1 text-sm"
            onClick={onAddManual}
          >
            + Add trip manually
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          disabled={!dirty || saveState === "saving"}
          className={
            "rounded-sm px-4 py-2 font-bold text-white " +
            (dirty && saveState !== "saving"
              ? "bg-blue"
              : "cursor-not-allowed bg-gray-400")
          }
          onClick={onSave}
        >
          {saveState === "saving" ? "Saving…" : "Save"}
        </button>
        {dirty && saveState !== "saving" && (
          <span className="text-secondary-text ml-3 text-sm">
            Unsaved changes
          </span>
        )}
        {saveState === "saved" && !dirty && (
          <span className="text-success ml-3 text-sm">Saved ✓</span>
        )}
        {saveState === "error" && saveError && (
          <pre className="text-error mt-2 rounded bg-white p-2 text-xs whitespace-pre-wrap">
            {saveError}
          </pre>
        )}
      </div>
    </div>
  );
}
