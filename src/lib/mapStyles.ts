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
import { buildBadgeHtml, getLineSlug } from "./badgeStyles";

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

/**
 * Busway stations use smaller markers than rail stations because busway stops
 * come in pairs (one per direction at different physical locations), so
 * larger markers would overlap. These markers use the line color as the
 * stroke with a white fill, visually distinguishing them from rail stations.
 */
/** Base radius (px) of busway station circles at low zoom. */
export const BUSWAY_STOP_RADIUS = 3;

/** Max radius (px) of busway station circles when zoomed in. */
export const BUSWAY_STOP_RADIUS_MAX = 7;

/** Base stroke width (px) of busway station circles at low zoom. */
export const BUSWAY_STOP_STROKE_WIDTH = 2;

/** Max stroke width (px) of busway station circles when zoomed in. */
export const BUSWAY_STOP_STROKE_WIDTH_MAX = 3.5;

/**
 * Rail stations on the system map use markers that are larger than busway
 * and bus stops but smaller than the default stop sizes (which are shared
 * with `LineMap.astro` for single-line close-up views). This keeps the
 * system map uncluttered while maintaining visual hierarchy.
 */
/** Base radius (px) of rail station circles at low zoom. */
export const RAIL_STOP_RADIUS = 4;

/** Max radius (px) of rail station circles when zoomed in. */
export const RAIL_STOP_RADIUS_MAX = 9;

/** Base stroke width (px) of rail station circles at low zoom. */
export const RAIL_STOP_STROKE_WIDTH = 2.5;

/** Max stroke width (px) of rail station circles when zoomed in. */
export const RAIL_STOP_STROKE_WIDTH_MAX = 4;

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
    filter?: ExpressionInput;
  },
): CircleLayerSpecification {
  const layer: CircleLayerSpecification = {
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
  if (options.filter !== undefined) {
    layer.filter = options.filter as CircleLayerSpecification["filter"];
  }
  return layer;
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

// ---------------------------------------------------------------------------
// Popup HTML builders
// ---------------------------------------------------------------------------

/**
 * Route info needed to render a badge inside a map popup. Shared by
 * station popups (rail/busway + co-located bus routes) and bus-stop
 * popups so both paths produce identical badge rows.
 */
export interface PopupBadgeInfo {
  routeId: string;
  routeType: number;
  routeShortName: string;
  routeColor: string;
  routeTextColor: string;
}

/**
 * Build a flex-wrapped row of route badges from an array of route info.
 * Returns an empty string when `badges` is empty so callers can inline
 * the result without producing an empty wrapper `<div>`.
 */
export function buildBadgeRow(badges: PopupBadgeInfo[]): string {
  if (badges.length === 0) return "";
  const html = badges
    .map((b) =>
      buildBadgeHtml({
        routeId: b.routeId,
        routeType: b.routeType,
        name: b.routeShortName,
        color: b.routeColor,
        textColor: b.routeTextColor,
        size: "sm",
        href: `/lines/${getLineSlug(b.routeId)}`,
      }),
    )
    .join("");
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${html}</div>`;
}

/**
 * Build the popup HTML for a stop (station or bus stop): a bold link to
 * the stop page followed by an optional flex-wrapped badge row. Used by
 * both rail/busway station markers and bus-stop markers so their popups
 * share identical formatting.
 */
export function buildStopPopupHtml(opts: {
  stopId: string;
  stopName: string;
  badges?: PopupBadgeInfo[];
}): string {
  const link = `<a href="/stops/${opts.stopId}" style="font-weight:600">${opts.stopName}</a>`;
  const badgeRow = opts.badges ? buildBadgeRow(opts.badges) : "";
  return badgeRow ? link + badgeRow : link;
}

/**
 * Build the popup HTML for a rail/busway line: a bold, colored link to
 * the line's detail page.
 */
export function buildLinePopupHtml(opts: {
  slug: string;
  routeShortName: string;
  color: string;
}): string {
  return `<a href="/lines/${opts.slug}" style="font-weight:bold;color:${opts.color}">${opts.routeShortName} Line</a>`;
}
