/**
 * Shared map style constants and layer/popup factory functions used by
 * both `SystemMap.astro` and `LineMap.astro`. Keeping these in one place
 * ensures stops and lines render consistently across all maps.
 */
import type {
  CircleLayerSpecification,
  LineLayerSpecification,
  PopupOptions,
  Map as MLMap,
  Popup as MLPopup,
} from "maplibre-gl";

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Width (px) of the colored line drawn on top of the casing. */
export const LINE_WIDTH = 6;

/** Width (px) of the white casing drawn beneath the colored line. */
export const CASING_WIDTH = LINE_WIDTH + 2;

/** Opacity of the colored line layer. */
export const LINE_OPACITY = 0.9;

/** White casing color, also used as the stop fill. */
export const WHITE = "#ffffff";

/** Dark stroke color for stops on multi-line maps (e.g. SystemMap). */
export const STOP_STROKE_DARK = "#1a1a1a";

/** Base radius (px) of stop/station circles at low zoom. */
export const STOP_RADIUS = 5;

/** Max radius (px) of stop/station circles when zoomed in. */
export const STOP_RADIUS_MAX = 12;

/** Base stroke width (px) of stop/station circles at low zoom. */
export const STOP_STROKE_WIDTH = 3;

/** Max stroke width (px) of stop/station circles when zoomed in. */
export const STOP_STROKE_WIDTH_MAX = 5;

/** Zoom level at which station circles start growing. */
export const STOP_MIN_ZOOM = 10;

/** Zoom level at which station circles reach their maximum size. */
export const STOP_MAX_ZOOM = 16;

/** Base radius (px) of bus stop circles at low zoom. */
export const BUS_STOP_RADIUS = 3;

/** Max radius (px) of bus stop circles when zoomed in (larger tap target). */
export const BUS_STOP_RADIUS_MAX = 8;

/** Base stroke width (px) of bus stop circles at low zoom. */
export const BUS_STOP_STROKE_WIDTH = 1.5;

/** Max stroke width (px) of bus stop circles when zoomed in. */
export const BUS_STOP_STROKE_WIDTH_MAX = 3;

/** Minimum zoom level at which bus stops are rendered. */
export const BUS_STOP_MIN_ZOOM = 13;

/** Zoom level at which bus stop circles reach their maximum size. */
export const BUS_STOP_MAX_ZOOM = 16;

/** Padding (px) passed to `fitBounds`. */
export const FIT_BOUNDS_PADDING = 20;

// ---------------------------------------------------------------------------
// Layer factory functions
// ---------------------------------------------------------------------------

/**
 * Accepted input for any paint property that can be either a literal value
 * or a MapLibre data expression (e.g. `["get", "color"]`).
 */
type ExpressionInput = string | number | unknown[];

/**
 * Create a white casing line layer. Drawn beneath the colored line layer
 * for visual separation of overlapping segments.
 *
 * Pass `offset: null` to omit `line-offset` (e.g. for single-line maps
 * where all features share the same centerline).
 */
export function makeCasingLayer(
  id: string,
  source: string,
  options: { offset?: ExpressionInput | null } = {},
): LineLayerSpecification {
  const paint: LineLayerSpecification["paint"] = {
    "line-color": WHITE,
    "line-width": CASING_WIDTH,
    "line-opacity": 1,
  };
  if (options.offset !== null) {
    paint["line-offset"] = (options.offset ?? ["get", "offset"]) as never;
  }
  return {
    id,
    type: "line",
    source,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint,
  };
}

/**
 * Create a colored line layer.
 */
export function makeLineLayer(
  id: string,
  source: string,
  options: {
    color: ExpressionInput;
    filter?: ExpressionInput;
    opacity?: number;
    offset?: ExpressionInput;
  },
): LineLayerSpecification {
  const paint: LineLayerSpecification["paint"] = {
    "line-color": options.color as never,
    "line-width": LINE_WIDTH,
    "line-opacity": options.opacity ?? LINE_OPACITY,
  };
  if (options.offset !== undefined) {
    paint["line-offset"] = options.offset as never;
  }
  const layer: LineLayerSpecification = {
    id,
    type: "line",
    source,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint,
  };
  if (options.filter !== undefined) {
    layer.filter = options.filter as LineLayerSpecification["filter"];
  }
  return layer;
}

/**
 * Create a stop/station circle layer with a white fill.
 *
 * By default, `circle-radius` and `circle-stroke-width` are zoom-interpolated
 * so markers grow larger when zoomed in, providing bigger tap/click targets.
 * Callers can override with explicit `radius` / `strokeWidth` expressions.
 */
export function makeStopLayer(
  id: string,
  source: string,
  options: {
    strokeColor: ExpressionInput;
    radius?: ExpressionInput;
    strokeWidth?: ExpressionInput;
  },
): CircleLayerSpecification {
  return {
    id,
    type: "circle",
    source,
    paint: {
      "circle-radius": (options.radius ?? [
        "interpolate",
        ["linear"],
        ["zoom"],
        STOP_MIN_ZOOM,
        STOP_RADIUS,
        STOP_MAX_ZOOM,
        STOP_RADIUS_MAX,
      ]) as never,
      "circle-color": WHITE,
      "circle-stroke-color": options.strokeColor as never,
      "circle-stroke-width": (options.strokeWidth ?? [
        "interpolate",
        ["linear"],
        ["zoom"],
        STOP_MIN_ZOOM,
        STOP_STROKE_WIDTH,
        STOP_MAX_ZOOM,
        STOP_STROKE_WIDTH_MAX,
      ]) as never,
      "circle-stroke-opacity": 1,
      "circle-opacity": 1,
    },
  };
}

/**
 * Create a bus stop circle layer — orange fill with a white outline.
 * Uses `minzoom` so the layer is only rendered when zoomed in enough for
 * individual stops to be meaningful.
 *
 * The `color` option controls the fill color (defaults to a bus-orange that
 * matches `--color-bus-local` / `--color-burnt-orange` from the Tailwind theme).
 * The stroke is always white for a clear outline.
 *
 * `circle-radius` and `circle-stroke-width` are zoom-interpolated so markers
 * grow larger when zoomed in, providing bigger tap/click targets.
 */
export function makeBusStopLayer(
  id: string,
  source: string,
  options: { minzoom?: number; color?: string } = {},
): CircleLayerSpecification {
  const layer: CircleLayerSpecification = {
    id,
    type: "circle",
    source,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        BUS_STOP_MIN_ZOOM,
        BUS_STOP_RADIUS,
        BUS_STOP_MAX_ZOOM,
        BUS_STOP_RADIUS_MAX,
      ] as never,
      "circle-color": (options.color ?? "#e16710") as never,
      "circle-stroke-color": WHITE as never,
      "circle-stroke-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        BUS_STOP_MIN_ZOOM,
        BUS_STOP_STROKE_WIDTH,
        BUS_STOP_MAX_ZOOM,
        BUS_STOP_STROKE_WIDTH_MAX,
      ] as never,
      "circle-stroke-opacity": 1,
      "circle-opacity": 0.8,
    },
  };
  if (options.minzoom !== undefined) {
    layer.minzoom = options.minzoom;
  }
  return layer;
}

// ---------------------------------------------------------------------------
// Popup helpers
// ---------------------------------------------------------------------------

/** Shared popup options for all map popups. */
export function makePopupOptions(): PopupOptions {
  return {
    closeButton: false,
    closeOnClick: true,
  };
}

/**
 * Attach click-popup and cursor-feedback handlers to a layer. The popup
 * content is read from `feature.properties[popupProperty]` (defaults to
 * `"popupHtml"`).
 */
export function attachPopupHandlers(
  map: MLMap,
  layerId: string,
  popup: MLPopup,
  popupProperty = "popupHtml",
): void {
  map.on("click", layerId, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const html = feature.properties?.[popupProperty];
    if (typeof html === "string") {
      popup.setHTML(html);
      popup.setLngLat(e.lngLat);
      popup.addTo(map);
    }
  });

  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

/**
 * Fit the map bounds to an array of `[lng, lat]` coordinates.
 */
export function fitBoundsToCoords(
  map: MLMap,
  maplibregl: typeof import("maplibre-gl"),
  coords: [number, number][],
  padding: number = FIT_BOUNDS_PADDING,
): void {
  if (coords.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const coord of coords) {
    bounds.extend(coord);
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding });
  }
}
