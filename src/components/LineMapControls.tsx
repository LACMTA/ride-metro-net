import { useStore } from "@nanostores/react";
import {
  lineMapGeoJson,
  lineMapSelection,
  setSplitLineNumber,
  setServiceType,
  setDirectionId,
} from "../lib/lineMapStore";
import type { RouteShapeFeature } from "../lib/getRouteShapes";

const SELECT_CLASS = "border-divider-line rounded border px-2 py-1";

/** Terminal stop name for a feature, used as the direction dropdown label. */
function destination(feature: RouteShapeFeature): string {
  const terminal = feature.properties.stops.at(-1);
  return terminal ? terminal.stopName : "Unknown direction";
}

/** Small label + control wrapper shared by all three selectors. */
function Control({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mr-2 font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Controls for the line map: split-line, service type, and direction
 * selectors. All state is read from and written to the shared
 * `lineMapStore` nanostores, so changes here instantly re-render both
 * the map (`LineMap.astro`) and the stop list (`StopList.tsx`).
 *
 * The split-line and service-type selectors are hidden when the route
 * has no split-lines or owl service, respectively.
 */
export default function LineMapControls() {
  const geojson = useStore(lineMapGeoJson);
  const selection = useStore(lineMapSelection);

  if (!geojson) {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-3 px-3 pt-3 pb-1">
        <span className="mr-2 font-medium text-gray-400">Loading…</span>
      </div>
    );
  }

  const { features, isSplitline } = geojson;

  // Split-line options — distinct splitLineNumber values, sorted.
  const splitLineOptions = isSplitline
    ? [
        ...new Set(
          features
            .map((f) => f.properties.splitLineNumber)
            .filter((n): n is string => n !== undefined),
        ),
      ].sort()
    : [];

  // Owl service exists for the current split-line selection?
  const hasOwl = features.some(
    (f) =>
      f.properties.serviceType === "owl" &&
      (selection.splitLineNumber === null ||
        f.properties.splitLineNumber === selection.splitLineNumber),
  );

  // Direction options — one per direction_id, sorted, for the current
  // service type + split-line selection.
  const directionOptions = features
    .filter(
      (f) =>
        f.properties.serviceType === selection.serviceType &&
        (selection.splitLineNumber === null ||
          f.properties.splitLineNumber === selection.splitLineNumber),
    )
    .reduce<RouteShapeFeature[]>((acc, f) => {
      const dirId = f.properties.directionIds[0] ?? 0;
      if (!acc.some((e) => (e.properties.directionIds[0] ?? 0) === dirId)) {
        acc.push(f);
      }
      return acc;
    }, [])
    .sort(
      (a, b) =>
        (a.properties.directionIds[0] ?? 0) -
        (b.properties.directionIds[0] ?? 0),
    );

  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 px-3 pt-3 pb-1">
      {splitLineOptions.length > 0 && (
        <Control label="Line:" htmlFor="split-line-select">
          <select
            id="split-line-select"
            className={SELECT_CLASS}
            value={selection.splitLineNumber ?? splitLineOptions[0]}
            onChange={(e) => setSplitLineNumber(e.target.value || null)}
          >
            {splitLineOptions.map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </Control>
      )}

      {hasOwl && (
        <Control label="Service:" htmlFor="service-type-select">
          <select
            id="service-type-select"
            className={SELECT_CLASS}
            value={selection.serviceType}
            onChange={(e) => setServiceType(e.target.value as "core" | "owl")}
          >
            <option value="core">Core</option>
            <option value="owl">Owl</option>
          </select>
        </Control>
      )}

      <Control label="To:" htmlFor="shape-select">
        <select
          id="shape-select"
          className={SELECT_CLASS}
          value={String(selection.directionId)}
          onChange={(e) => setDirectionId(Number(e.target.value))}
        >
          {directionOptions.map((f) => {
            const dirId = f.properties.directionIds[0] ?? 0;
            return (
              <option key={dirId} value={dirId}>
                {destination(f)}
              </option>
            );
          })}
        </select>
      </Control>
    </div>
  );
}
