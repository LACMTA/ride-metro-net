import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { FeatureCollection, LineString, Point } from "geojson";
import { createMap } from "../../lib/createMap";
import {
  LINE_WIDTH,
  fitBoundsToCoords,
  makeCasingLayer,
  makeLineLayer,
  makePopupOptions,
  makeStopLayer,
} from "../../lib/mapStyles";
import type {
  AdminShape,
  AdminStop,
  StopDisplayMode,
} from "../../lib/admin/types";

/** Stroke color for stops not covered by the draft config (dark red). */
const UNCOVERED_STOP_COLOR = "#aa2a16";

/**
 * Opacity for candidate shape lines. Semi-transparent so overlapping
 * shapes composite: corridors served by many shapes read darker than
 * corridors served by few — a density view of the line.
 */
const SHAPE_BASE_OPACITY = 0.4;

const LINES_SOURCE = "admin-lines";
const STOPS_SOURCE = "admin-stops";
const CASING_LAYER = "admin-casing";
const GHOST_LAYER = "admin-ghost";
const SELECTED_LAYER = "admin-selected";
const HOVER_LAYER = "admin-hover";
const COVERED_STOPS_LAYER = "admin-stops-covered";
const UNCOVERED_STOPS_LAYER = "admin-stops-uncovered";

interface Props {
  /** ESRI basemap key, passed from the page — Astro env-schema variables
   * are not inlined into client-side import.meta.env, so the page reads
   * the key server-side (mirroring SystemMap.astro / LineMap.astro). */
  esriKey: string;
  /** Resolved line color (hex with leading "#"). */
  lineColor: string;
  /** All distinct shape geometries for the line. */
  shapes: AdminShape[];
  /** Every stop the line serves (the coverage baseline). */
  stops: AdminStop[];
  /** Stop IDs covered by the trips currently in the draft config. */
  coveredStopIds: Set<string>;
  /** Shape IDs drawn as selected (full-color) lines. */
  selectedShapeIds: Set<string>;
  /** Shape ID of the hovered trip, if any. */
  hoveredShapeId: string | null;
  /** Which stops to render: only coverage gaps, all, or none. */
  stopDisplay: StopDisplayMode;
  /**
   * Shapes excluded from the map (toggled via shape labels). The hovered
   * shape still renders even when hidden, so hovering a dimmed label
   * reveals where it is.
   */
  hiddenShapeIds: Set<string>;
  /** Stop popup button: show only the shapes whose trips serve a stop. */
  onFilterByStop: (stopId: string) => void;
}

type MapState = {
  map: MLMap;
  maplibregl: typeof import("maplibre-gl");
  loaded: boolean;
};

/**
 * Dev-only map for the line config editor. Draws every distinct shape as
 * a semi-transparent line in the full line color — overlapping shapes
 * composite, so corridors served by many shapes read darker than
 * corridors served by few. The draft config's shapes draw at the
 * standard line opacity on top, the hovered trip's shape is emphasized
 * (standard opacity, wider), and every stop the line serves is colored
 * by whether the draft config covers it.
 *
 * The parent remounts this component per line (`key={routeId}`), so each
 * instance only ever renders one line's data.
 */
export default function AdminLineMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapStateRef = useRef<MapState | null>(null);
  const propsRef = useRef(props);
  const didFitRef = useRef(false);

  /** Pushes the latest props into the map's sources and layers. */
  function render(): void {
    const state = mapStateRef.current;
    if (!state?.loaded) return;
    const current = propsRef.current;

    const lineData: FeatureCollection<LineString> = {
      type: "FeatureCollection",
      features: current.shapes
        .filter(
          (shape) =>
            !current.hiddenShapeIds.has(shape.shapeId) ||
            current.hoveredShapeId === shape.shapeId,
        )
        .map((shape) => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: shape.coordinates,
          },
          properties: {
            role:
              current.hoveredShapeId === shape.shapeId
                ? "hover"
                : current.selectedShapeIds.has(shape.shapeId)
                  ? "selected"
                  : "ghost",
          },
        })),
    };

    const stopData: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: current.stops.map((stop) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [stop.lon, stop.lat],
        },
        properties: {
          stopId: stop.stopId,
          stopName: stop.stopName,
          covered: current.coveredStopIds.has(stop.stopId),
        },
      })),
    };

    (state.map.getSource(LINES_SOURCE) as GeoJSONSource | undefined)?.setData(
      lineData,
    );
    (state.map.getSource(STOPS_SOURCE) as GeoJSONSource | undefined)?.setData(
      stopData,
    );

    state.map.setLayoutProperty(
      COVERED_STOPS_LAYER,
      "visibility",
      current.stopDisplay === "all" ? "visible" : "none",
    );
    state.map.setLayoutProperty(
      UNCOVERED_STOPS_LAYER,
      "visibility",
      current.stopDisplay === "none" ? "none" : "visible",
    );

    if (!didFitRef.current && current.shapes.length > 0) {
      fitBoundsToCoords(
        state.map,
        state.maplibregl,
        current.shapes.flatMap((s) => s.coordinates),
      );
      didFitRef.current = true;
    }
  }

  // Mount: create the map and its sources/layers once.
  useEffect(() => {
    let disposed = false;

    (async () => {
      const container = containerRef.current;
      if (!container) return;
      const { map, maplibregl } = await createMap(
        container,
        propsRef.current.esriKey,
        true,
      );
      if (disposed) {
        map.remove();
        return;
      }
      mapStateRef.current = { map, maplibregl, loaded: false };

      map.on("load", () => {
        map.addSource(LINES_SOURCE, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          } as FeatureCollection<LineString>,
        });
        map.addSource(STOPS_SOURCE, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          } as FeatureCollection<Point>,
        });

        const lineColor = propsRef.current.lineColor;

        map.addLayer(
          makeCasingLayer(CASING_LAYER, LINES_SOURCE, { offset: null }),
        );
        map.addLayer(
          makeLineLayer(GHOST_LAYER, LINES_SOURCE, {
            color: lineColor,
            filter: ["==", ["get", "role"], "ghost"],
            opacity: SHAPE_BASE_OPACITY,
          }),
        );
        map.addLayer(
          makeLineLayer(SELECTED_LAYER, LINES_SOURCE, {
            color: lineColor,
            filter: ["==", ["get", "role"], "selected"],
          }),
        );
        map.addLayer(
          makeLineLayer(HOVER_LAYER, LINES_SOURCE, {
            color: lineColor,
            filter: ["==", ["get", "role"], "hover"],
          }),
        );
        // Emphasize the hovered trip's line by drawing it wider than the rest.
        map.setPaintProperty(HOVER_LAYER, "line-width", LINE_WIDTH + 3);

        map.addLayer(
          makeStopLayer(COVERED_STOPS_LAYER, STOPS_SOURCE, {
            strokeColor: lineColor,
            filter: ["==", ["get", "covered"], true],
          }),
        );
        map.addLayer(
          makeStopLayer(UNCOVERED_STOPS_LAYER, STOPS_SOURCE, {
            strokeColor: UNCOVERED_STOP_COLOR,
            filter: ["==", ["get", "covered"], false],
          }),
        );

        // --- Stop popups: the stop's name plus a button that shows only
        // the shapes whose trips serve the clicked stop. ---
        const popup = new maplibregl.Popup(makePopupOptions());
        for (const layerId of [COVERED_STOPS_LAYER, UNCOVERED_STOPS_LAYER]) {
          map.on("click", layerId, (e) => {
            const feature = e.features?.[0];
            const stopId = feature?.properties?.stopId as string | undefined;
            if (!stopId) return;
            const stopName =
              (feature?.properties?.stopName as string | undefined) ?? "Stop";
            popup.setHTML(`
              <div style="font-weight:600">${stopName}</div>
              <button
                type="button"
                class="border-blue text-blue rounded-sm border px-2 py-1 text-sm"
                style="display:block;margin-top:6px"
              >
                Show only shapes serving this stop
              </button>
            `);
            popup.setLngLat(e.lngLat);
            popup.addTo(map);
            popup
              .getElement()
              .querySelector("button")
              ?.addEventListener("click", () => {
                propsRef.current.onFilterByStop(stopId);
                popup.remove();
              });
          });
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });
        }

        if (mapStateRef.current) mapStateRef.current.loaded = true;
        render();
      });
    })();

    return () => {
      disposed = true;
      mapStateRef.current?.map.remove();
      mapStateRef.current = null;
    };
  }, []);

  // Every render: refresh the props ref and push data (cheap if unchanged).
  useEffect(() => {
    propsRef.current = props;
    render();
  });

  return (
    <div className="bg-background-white mb-4 overflow-hidden rounded-lg">
      <div
        ref={containerRef}
        className="h-[30rem] w-full"
        aria-label="Map of candidate trips for this line"
        role="img"
      />
    </div>
  );
}
