import { useMemo, useState } from "react";
import type { AdminShape, AdminTripInfo } from "../../lib/admin/types";

interface Props {
  shapes: AdminShape[];
  /** Candidate trips, aggregated per shape for counts + representative. */
  trips: AdminTripInfo[];
  /** Shapes used by at least one draft trip (the add button shows ✓). */
  selectedShapeIds: Set<string>;
  /** Shapes toggled off the map via label-body clicks. */
  hiddenShapeIds: Set<string>;
  hoveredShapeId: string | null;
  onHover: (shapeId: string | null) => void;
  /**
   * The leading + / ✓ button: adds the shape's representative trip to the
   * draft config, or removes its trips when already configured.
   */
  onToggleShape: (shapeId: string, representative: AdminTripInfo) => void;
  /** Label body click: toggles the shape's visibility on the map. */
  onToggleVisibility: (shapeId: string) => void;
  /** The header's hide-all / show-all buttons. */
  onSetAllHidden: (hidden: boolean) => void;
}

const INPUT_CLASS = "border-divider-line rounded border px-2 py-1";
const HEADER_BUTTON_CLASS =
  "border-border-light bg-white text-secondary-text hover:text-metro-text rounded-sm border px-2 py-1 text-sm";

interface ShapeLabel {
  shapeId: string;
  tripCount: number;
  representative: AdminTripInfo | undefined;
}

/**
 * Dev-only: the field of shape labels shown under the admin map — one per
 * distinct shape rather than one per trip. Each label shows how many
 * candidate trips use the shape plus its representative trip's direction
 * and headsign. The leading + button adds/removes the representative trip
 * in the draft config; clicking the label body toggles the shape's
 * visibility on the map (dimmed labels are hidden). Hovering a label
 * highlights the shape on the map.
 */
export default function TripLabels({
  shapes,
  trips,
  selectedShapeIds,
  hiddenShapeIds,
  hoveredShapeId,
  onHover,
  onToggleShape,
  onToggleVisibility,
  onSetAllHidden,
}: Props) {
  const [filter, setFilter] = useState("");

  const labels = useMemo<ShapeLabel[]>(() => {
    const byShape = new Map<string, AdminTripInfo[]>();
    for (const trip of trips) {
      const list = byShape.get(trip.shapeId);
      if (list) list.push(trip);
      else byShape.set(trip.shapeId, [trip]);
    }
    return shapes
      .map((shape) => {
        const list = byShape.get(shape.shapeId) ?? [];
        // Representative: most stops, ties broken by smallest tripId —
        // the same heuristic the seed script uses for canonical trips.
        const representative = [...list].sort(
          (a, b) =>
            b.stopCount - a.stopCount || a.tripId.localeCompare(b.tripId),
        )[0];
        return {
          shapeId: shape.shapeId,
          tripCount: list.length,
          representative,
        };
      })
      .sort(
        (a, b) =>
          (a.representative?.directionId ?? 0) -
            (b.representative?.directionId ?? 0) || b.tripCount - a.tripCount,
      );
  }, [shapes, trips]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return labels;
    return labels.filter(
      (label) =>
        label.shapeId.toLowerCase().includes(needle) ||
        (label.representative?.headsign.toLowerCase().includes(needle) ??
          false),
    );
  }, [labels, filter]);

  const allHidden = hiddenShapeIds.size >= shapes.length && shapes.length > 0;
  const noneHidden = hiddenShapeIds.size === 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          className={INPUT_CLASS + " w-64"}
          placeholder="Filter shapes (id, headsign)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="text-secondary-text text-sm">
          {visible.length} of {labels.length} shapes
          {hiddenShapeIds.size > 0 && ` · ${hiddenShapeIds.size} hidden`}
        </span>
        <button
          type="button"
          className={HEADER_BUTTON_CLASS}
          disabled={allHidden}
          onClick={() => onSetAllHidden(true)}
        >
          Hide all
        </button>
        <button
          type="button"
          className={HEADER_BUTTON_CLASS}
          disabled={noneHidden}
          onClick={() => onSetAllHidden(false)}
        >
          Show all
        </button>
      </div>
      <div
        className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto pr-1"
        onMouseLeave={() => onHover(null)}
      >
        {visible.map((label) => {
          const selected = selectedShapeIds.has(label.shapeId);
          const hovered = hoveredShapeId === label.shapeId;
          const hidden = hiddenShapeIds.has(label.shapeId);
          const rep = label.representative;
          return (
            <div
              key={label.shapeId}
              onMouseEnter={() => onHover(label.shapeId)}
              title={
                rep
                  ? `${label.shapeId} · ${label.tripCount} trips · click body to show/hide on map · ${selected ? "✓ removes" : "+ adds"} ${rep.tripId}`
                  : `${label.shapeId} · click body to show/hide on map`
              }
              className={
                "flex items-center rounded-sm border px-2 py-1 text-sm " +
                (selected
                  ? "border-success bg-success-xlight text-success "
                  : "border-border-light text-metro-text bg-white ") +
                (hovered ? "ring-blue ring-2 " : "") +
                (hidden ? "opacity-50 grayscale" : "")
              }
            >
              <button
                type="button"
                disabled={!rep}
                onClick={() => rep && onToggleShape(label.shapeId, rep)}
                aria-label={
                  selected ? "Remove this shape's trips" : "Add this shape"
                }
                className={
                  "mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border leading-none font-bold disabled:opacity-50 " +
                  (selected
                    ? "border-success text-success"
                    : "border-blue text-blue")
                }
              >
                {selected ? "✓" : "+"}
              </button>
              <button
                type="button"
                onClick={() => onToggleVisibility(label.shapeId)}
                aria-label="Show or hide this shape on the map"
                className="text-left"
              >
                <span className="font-mono text-xs">{label.shapeId}</span>
                {" · "}
                <span>
                  {label.tripCount} trip{label.tripCount === 1 ? "" : "s"}
                </span>
                {rep && (
                  <>
                    {" · "}
                    <span>dir {rep.directionId ?? "—"}</span>
                    {" · "}
                    <span className="inline-block max-w-40 truncate align-middle">
                      {rep.headsign || "—"}
                    </span>
                    {rep.owlHint === "owl" && (
                      <span className="ml-1 font-mono text-[10px] uppercase">
                        owl?
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
