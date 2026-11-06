import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import RouteBadge from "../RouteBadge";
import type { DisplayOrderEntry, ScreenDimensions } from "../../data/types";
import {
  DEFAULT_PAGINATION_INTERVAL_MS,
  DEFAULT_SCREEN_DIMENSIONS,
  measureDisplayOrderEntry,
  packIntoPages,
  paginatedAreaHeight,
  PAGINATION_INTERVAL_MAX_MS,
  PAGINATION_INTERVAL_MIN_MS,
  SCREEN_DIMENSIONS_MAX,
  SCREEN_DIMENSIONS_MIN,
  SCREEN_ROW_HEIGHTS,
} from "../../lib/screenLayout";
import type {
  AdminScreenDetail,
  AdminScreenRouteStopInfo,
  AdminScreenSaveResponse,
  AdminScreenStopLookupResult,
  AdminScreenSummary,
} from "../../lib/admin/types";

const SELECT_CLASS = "border-divider-line rounded border px-2 py-1";
const INPUT_CLASS = SELECT_CLASS;
const BUTTON_CLASS = SELECT_CLASS;

/** URL-safe kebab-case slug pattern — matches the server's validation. */
const SIGN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Debounce for the add-stop search (ms). */
const STOP_SEARCH_DEBOUNCE_MS = 250;
/** Debounce for the serving-routes preview fetch (ms). */
const ROUTE_PREVIEW_DEBOUNCE_MS = 300;

type SaveState = "idle" | "saving" | "saved" | "error";

interface ScreenDraft {
  stopIds: string[];
  /** The paginated displayOrder list. */
  displayOrder: DisplayOrderEntry[];
  /** Always-visible components rendered above the paginated list. */
  fixedComponents: DisplayOrderEntry[];
  /** Target pixel dimensions (concrete; defaults applied on load). */
  dimensions: ScreenDimensions;
  /** Page-flip interval in ms (concrete; default applied on load). */
  intervalMs: number;
}

/** Which draft component list a row belongs to. */
type ListKey = "displayOrder" | "fixedComponents";

/** Display info for a stop ID, accumulated from detail loads and searches. */
interface StopInfo {
  stopName: string;
  isParentStation: boolean;
  /** False when the stop no longer exists in the GTFS database. */
  found: boolean;
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

/**
 * Dev-only island for /admin/screens: pick a screen sign, edit its stop IDs
 * (with a top-level-stop lookup), and arrange its displayOrder — route-stop
 * pair rows and header components — into shape. All data is fetched at
 * runtime from /admin/api/screens* and saved to src/data/screenSigns.json.
 */
export default function ScreenEditor() {
  const [signs, setSigns] = useState<AdminScreenSummary[] | null>(null);
  const [signId, setSignId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [baseline, setBaseline] = useState<ScreenDraft | null>(null);
  const [draft, setDraft] = useState<ScreenDraft | null>(null);
  const [servingPairs, setServingPairs] = useState<AdminScreenRouteStopInfo[]>(
    [],
  );
  const [stalePairs, setStalePairs] = useState<AdminScreenRouteStopInfo[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stopQuery, setStopQuery] = useState("");
  const [stopResults, setStopResults] = useState<
    AdminScreenStopLookupResult[] | null
  >(null);
  const [stopSearchError, setStopSearchError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ list: ListKey; index: number } | null>(
    null,
  );
  const [headerText, setHeaderText] = useState("");
  const [fixedHeaderText, setFixedHeaderText] = useState("");

  // Display-info caches. Written alongside a state update that triggers the
  // next render, so plain refs (no re-render of their own) are fine here.
  const stopInfoRef = useRef<Map<string, StopInfo>>(new Map());

  // Tracks the latest selection so stale detail responses can be dropped.
  const signIdRef = useRef<string | null>(null);
  signIdRef.current = signId;

  const trimmedSlug = newSlug.trim();
  const slugInvalid =
    isNew && trimmedSlug !== "" && !SIGN_ID_PATTERN.test(trimmedSlug);
  const slugTaken =
    isNew && (signs?.some((s) => s.signId === trimmedSlug) ?? false);
  const dirty = isNew
    ? (draft?.stopIds.length ?? 0) > 0
    : baseline !== null &&
      draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(baseline);

  // Keys ("routeId:stopId") of route-stop entries in either draft list.
  const draftPairKeys = useMemo(
    () =>
      new Set(
        (draft
          ? [...draft.fixedComponents, ...draft.displayOrder]
          : []
        ).flatMap((entry) =>
          typeof entry === "object" &&
          entry !== null &&
          entry.component === "route-stop"
            ? [`${entry.routeId}:${entry.stopId}`]
            : [],
        ),
      ),
    [draft?.fixedComponents, draft?.displayOrder],
  );

  // Serving-pair keys — used to flag draft pairs that no longer serve.
  const servingPairKeys = useMemo(
    () => new Set(servingPairs.map((pair) => `${pair.routeId}:${pair.stopId}`)),
    [servingPairs],
  );

  // Pair display info by "routeId:stopId" — serving pairs plus stale pairs
  // (saved but not currently serving) so every row can render.
  const pairInfoMap = useMemo(() => {
    const map = new Map<string, AdminScreenRouteStopInfo>();
    for (const pair of [...servingPairs, ...stalePairs]) {
      const key = `${pair.routeId}:${pair.stopId}`;
      if (!map.has(key)) map.set(key, pair);
    }
    return map;
  }, [servingPairs, stalePairs]);

  // Route-stop pairs serving the draft stops but not already in the display
  // order.
  const availablePairs = useMemo(
    () =>
      servingPairs.filter(
        (pair) => !draftPairKeys.has(`${pair.routeId}:${pair.stopId}`),
      ),
    [servingPairs, draftPairKeys],
  );

  // Rows-per-page / page-count estimate for the draft, using the same
  // build-time packing math as the sign page. Approximate: each entry
  // counts as one row (entries without directionId can expand into
  // multiple route cards at build time).
  const paginationEstimate = useMemo(() => {
    if (!draft) return null;
    const fixedHeight = draft.fixedComponents.reduce(
      (sum, entry) => sum + measureDisplayOrderEntry(entry).height,
      0,
    );
    const available = paginatedAreaHeight(draft.dimensions, fixedHeight);
    const pages = packIntoPages(
      draft.displayOrder,
      available,
      measureDisplayOrderEntry,
    );
    return {
      rowsPerPage: Math.floor(available / SCREEN_ROW_HEIGHTS.route),
      pageCount: pages.length,
    };
  }, [draft]);

  /** Loads one sign's editor data; drops the response if the user moved on. */
  async function loadSign(nextSignId: string): Promise<void> {
    setLoadError(null);
    setSaveState("idle");
    setSaveError(null);
    setIsNew(false);
    setDraft(null);
    setBaseline(null);
    setServingPairs([]);
    setStalePairs([]);
    setStopQuery("");
    setStopResults(null);
    setStopSearchError(null);
    try {
      const detail = await fetchJson<AdminScreenDetail>(
        `/admin/api/screens/${encodeURIComponent(nextSignId)}`,
      );
      if (signIdRef.current !== nextSignId) return;

      for (const stop of detail.stops) {
        stopInfoRef.current.set(stop.stopId, {
          stopName: stop.stopName,
          isParentStation: stop.isParentStation,
          found: stop.found,
        });
      }
      setServingPairs(detail.servingPairs);
      setStalePairs(detail.stalePairs);

      // Draft shape: the saved config with concrete defaults applied.
      // Optional fields (dimensions, pagination, fixedComponents) are
      // normalized to concrete values so the inputs always have something
      // to edit; saving always writes them explicitly. displayOrder is an
      // allowlist — pairs serving the stops but not listed are shown in the
      // available route-stop pairs section below, never auto-added.
      const toDraft = (): ScreenDraft => ({
        stopIds: [...detail.config.stopIds],
        displayOrder: detail.config.displayOrder.map((entry) => ({
          ...entry,
        })),
        fixedComponents: detail.config.fixedComponents.map((entry) => ({
          ...entry,
        })),
        dimensions: detail.config.dimensions
          ? { ...detail.config.dimensions }
          : { ...DEFAULT_SCREEN_DIMENSIONS },
        intervalMs:
          detail.config.pagination?.intervalMs ??
          DEFAULT_PAGINATION_INTERVAL_MS,
      });

      setBaseline(toDraft());
      setDraft(toDraft());
    } catch (e) {
      if (signIdRef.current === nextSignId) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  /** Selects a sign, guarding against discarding unsaved changes. */
  function selectSign(nextSignId: string): void {
    if (nextSignId === signId) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSignId(nextSignId);
  }

  /** Enters the new-sign flow (guarded against unsaved changes). */
  function startNewSign(): void {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setIsNew(true);
    setSignId(null);
    setDraft({
      stopIds: [],
      displayOrder: [],
      fixedComponents: [],
      dimensions: { ...DEFAULT_SCREEN_DIMENSIONS },
      intervalMs: DEFAULT_PAGINATION_INTERVAL_MS,
    });
    setBaseline(null);
    setServingPairs([]);
    setStalePairs([]);
    setNewSlug("");
    setSaveState("idle");
    setSaveError(null);
    setLoadError(null);
    setStopQuery("");
    setStopResults(null);
    setStopSearchError(null);
  }

  /** Leaves the new-sign flow without saving. */
  function cancelNewSign(): void {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setIsNew(false);
    setNewSlug("");
    setDraft(null);
    setBaseline(null);
    setServingPairs([]);
    setStalePairs([]);
    if (signs && signs[0]) setSignId(signs[0].signId);
  }

  // Initial load: sign list, then the ?signId= sign (or the first).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchJson<{ signs: AdminScreenSummary[] }>(
          "/admin/api/screens",
        );
        setSigns(res.signs);
        const wanted = new URLSearchParams(window.location.search).get(
          "signId",
        );
        const initial =
          res.signs.find((s) => s.signId === wanted)?.signId ??
          res.signs[0]?.signId ??
          null;
        if (initial) setSignId(initial);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // Load the selected sign whenever the selection changes.
  useEffect(() => {
    if (signId) void loadSign(signId);
  }, [signId]);

  // Keep the URL in sync so a sign selection survives reloads.
  useEffect(() => {
    if (signId) {
      window.history.replaceState(
        null,
        "",
        `/admin/screens?signId=${encodeURIComponent(signId)}`,
      );
    }
  }, [signId]);

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

  // Add-stop lookup: debounced search over top-level stops only.
  useEffect(() => {
    const trimmed = stopQuery.trim();
    if (trimmed === "") {
      setStopResults(null);
      setStopSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchJson<{ stops: AdminScreenStopLookupResult[] }>(
          `/admin/api/screens/stop-search?q=${encodeURIComponent(trimmed)}`,
        );
        if (!cancelled) {
          setStopResults(res.stops);
          setStopSearchError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setStopSearchError(e instanceof Error ? e.message : String(e));
        }
      }
    }, STOP_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stopQuery]);

  // Serving-routes preview: refetch whenever the draft stop IDs change so
  // the available-routes list stays in sync before anything is saved.
  // displayOrder is never modified here — routes must be added explicitly.
  const draftStopIdsKey = draft?.stopIds.join(",") ?? "";
  useEffect(() => {
    if (!draft || draft.stopIds.length === 0) {
      setServingPairs([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchJson<{ pairs: AdminScreenRouteStopInfo[] }>(
          `/admin/api/screens/route-preview?stopIds=${encodeURIComponent(draftStopIdsKey)}`,
        );
        if (cancelled) return;
        setServingPairs(res.pairs);
      } catch {
        // Advisory endpoint — ignore failures; saved data still loads.
      }
    }, ROUTE_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftStopIdsKey]);

  // --- Draft mutations ---

  function addStop(stop: AdminScreenStopLookupResult): void {
    setDraft((prev) =>
      prev && !prev.stopIds.includes(stop.stopId)
        ? { ...prev, stopIds: [...prev.stopIds, stop.stopId] }
        : prev,
    );
    stopInfoRef.current.set(stop.stopId, {
      stopName: stop.stopName,
      isParentStation: stop.isParentStation,
      found: true,
    });
    setStopQuery("");
    setStopResults(null);
  }

  function removeStop(stopId: string): void {
    setDraft((prev) =>
      prev
        ? { ...prev, stopIds: prev.stopIds.filter((id) => id !== stopId) }
        : prev,
    );
  }

  /** Applies an updater to one of the draft's component lists. */
  function mutateList(
    list: ListKey,
    updater: (entries: DisplayOrderEntry[]) => DisplayOrderEntry[],
  ): void {
    setDraft((prev) =>
      prev ? { ...prev, [list]: updater(prev[list]) } : prev,
    );
  }

  /** Reorders one of the draft's component lists (drag + arrow buttons). */
  function reorderEntry(list: ListKey, from: number, to: number): void {
    mutateList(list, (entries) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= entries.length ||
        to >= entries.length
      ) {
        return entries;
      }
      const next = [...entries];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function moveEntry(list: ListKey, index: number, delta: -1 | 1): void {
    reorderEntry(list, index, index + delta);
  }

  function removeEntry(list: ListKey, index: number): void {
    mutateList(list, (entries) => entries.filter((_, i) => i !== index));
  }

  /**
   * Moves an entry between the fixed and paginated lists — to the end of
   * the other list.
   */
  function moveBetweenLists(from: ListKey, index: number): void {
    const to: ListKey =
      from === "displayOrder" ? "fixedComponents" : "displayOrder";
    setDraft((prev) => {
      if (!prev) return prev;
      const entry = prev[from][index];
      if (!entry) return prev;
      return {
        ...prev,
        [from]: prev[from].filter((_, i) => i !== index),
        [to]: [...prev[to], entry],
      };
    });
  }

  /** Appends a route-stop pair component to the draft displayOrder. */
  function addPair(pair: AdminScreenRouteStopInfo): void {
    mutateList("displayOrder", (entries) => [
      ...entries,
      {
        component: "route-stop" as const,
        routeId: pair.routeId,
        stopId: pair.stopId,
      },
    ]);
  }

  /** Appends a header component with the given text. */
  function addHeader(list: ListKey, text: string): void {
    const trimmed = text.trim();
    if (trimmed === "") return;
    mutateList(list, (entries) => [
      ...entries,
      { component: "header" as const, text: trimmed },
    ]);
  }

  /** Edits the text of the header component at the given index. */
  function updateHeaderText(list: ListKey, index: number, text: string): void {
    mutateList(list, (entries) => {
      const entry = entries[index];
      if (!entry || entry.component !== "header") return entries;
      const next = [...entries];
      next[index] = { ...entry, text };
      return next;
    });
  }

  /** Sets one side of the draft's screen dimensions from an input string. */
  function setDimension(side: "width" | "height", raw: string): void {
    const value = Number(raw);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            dimensions: {
              ...prev.dimensions,
              [side]: Number.isFinite(value) ? Math.round(value) : 0,
            },
          }
        : prev,
    );
  }

  /** Sets the draft's page-flip interval, in seconds, from an input. */
  function setIntervalSeconds(raw: string): void {
    const seconds = Number(raw);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            intervalMs: Number.isFinite(seconds)
              ? Math.round(seconds * 1000)
              : 0,
          }
        : prev,
    );
  }

  function handleDragStart(
    list: ListKey,
    index: number,
    e: React.DragEvent,
  ): void {
    e.dataTransfer.effectAllowed = "move";
    // Firefox doesn't start a drag unless data is set.
    e.dataTransfer.setData("text/plain", String(index));
    setDrag({ list, index });
  }

  function handleDragOver(
    list: ListKey,
    index: number,
    e: React.DragEvent,
  ): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Drag reorders within a list; cross-list moves use the explicit
    // "to fixed / to paginated" buttons on each row.
    if (!drag || drag.list !== list || drag.index === index) return;
    reorderEntry(list, drag.index, index);
    setDrag({ list, index });
  }

  function handleDragEnd(): void {
    setDrag(null);
  }

  // --- Save / delete / refresh ---

  async function refreshSigns(): Promise<AdminScreenSummary[]> {
    const res = await fetchJson<{ signs: AdminScreenSummary[] }>(
      "/admin/api/screens",
    );
    setSigns(res.signs);
    return res.signs;
  }

  async function save(): Promise<void> {
    const target = isNew ? trimmedSlug : signId;
    if (!target || !draft) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetchJson<AdminScreenSaveResponse>(
        `/admin/api/screens/${encodeURIComponent(target)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stopIds: draft.stopIds,
            displayOrder: draft.displayOrder,
            fixedComponents: draft.fixedComponents,
            dimensions: draft.dimensions,
            pagination: { intervalMs: draft.intervalMs },
          }),
        },
      );
      const toDraft = (src: AdminScreenSaveResponse): ScreenDraft => ({
        stopIds: [...src.stopIds],
        displayOrder: src.displayOrder.map((entry) => ({ ...entry })),
        fixedComponents: src.fixedComponents.map((entry) => ({ ...entry })),
        dimensions: src.dimensions
          ? { ...src.dimensions }
          : { ...DEFAULT_SCREEN_DIMENSIONS },
        intervalMs:
          src.pagination?.intervalMs ?? DEFAULT_PAGINATION_INTERVAL_MS,
      });
      setBaseline(toDraft(res));
      setDraft(toDraft(res));
      setSaveState("saved");
      if (isNew) {
        setIsNew(false);
        setNewSlug("");
        setSignId(target); // reloads the saved sign through loadSign
      } else {
        await refreshSigns();
      }
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteSign(): Promise<void> {
    if (!signId) return;
    if (
      !window.confirm(
        `Delete the sign "${signId}" from screenSigns.json? Its public page will no longer be built.`,
      )
    ) {
      return;
    }
    setSaveError(null);
    try {
      await fetchJson(`/admin/api/screens/${encodeURIComponent(signId)}`, {
        method: "DELETE",
      });
      const remaining = await refreshSigns();
      setSaveState("idle");
      if (remaining[0]) setSignId(remaining[0].signId);
      else {
        setSignId(null);
        setDraft(null);
        setBaseline(null);
        setServingPairs([]);
        setStalePairs([]);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Renders one draggable component row, shared by both lists. */
  function renderEntryRow(
    list: ListKey,
    entry: DisplayOrderEntry,
    index: number,
    last: boolean,
  ): ReactElement {
    const dragging = drag?.list === list && drag.index === index;
    const moveButton =
      list === "displayOrder" ? (
        <button
          type="button"
          className="text-secondary-text hover:text-metro-text px-1 text-xs"
          aria-label="Move to the fixed components"
          onClick={() => moveBetweenLists("displayOrder", index)}
        >
          To fixed
        </button>
      ) : (
        <button
          type="button"
          className="text-secondary-text hover:text-metro-text px-1 text-xs"
          aria-label="Move to the paginated display order"
          onClick={() => moveBetweenLists("fixedComponents", index)}
        >
          To paginated
        </button>
      );

    if (entry.component === "route-stop") {
      const pairKey = `${entry.routeId}:${entry.stopId}`;
      const pair = pairInfoMap.get(pairKey);
      const serving = servingPairKeys.has(pairKey);
      const stopName =
        pair?.stopName ??
        stopInfoRef.current.get(entry.stopId)?.stopName ??
        entry.stopId;
      return (
        <li
          key={`route-stop-${index}`}
          draggable
          onDragStart={(e) => handleDragStart(list, index, e)}
          onDragOver={(e) => handleDragOver(list, index, e)}
          onDrop={(e) => {
            e.preventDefault();
            handleDragEnd();
          }}
          onDragEnd={handleDragEnd}
          className={
            "flex items-center gap-3 px-3 py-2" +
            (dragging ? " opacity-50" : "")
          }
        >
          <span
            className="text-secondary-text cursor-grab select-none"
            aria-hidden="true"
          >
            ⠿
          </span>
          {pair && pair.known ? (
            <RouteBadge
              routeId={entry.routeId}
              routeType={pair.routeType}
              name={pair.label}
              color={pair.routeColor}
              textColor={pair.routeTextColor}
            />
          ) : (
            <span className="border-error text-error rounded-sm border px-1.5 py-0.5 font-mono text-xs">
              {entry.routeId}
            </span>
          )}
          <span className="text-secondary-text text-sm">
            {pair?.headsigns.join(" / ") || pair?.longName}
          </span>
          <span className="text-metro-text text-sm">at {stopName}</span>
          <span className="text-secondary-text font-mono text-xs">
            {entry.stopId}
          </span>
          {entry.directionId !== undefined && (
            <span className="border-blue text-blue rounded-sm border px-1.5 py-0.5 text-xs">
              dir {entry.directionId}
            </span>
          )}
          {pair && !pair.known && (
            <span className="text-error text-xs font-bold">not in GTFS</span>
          )}
          {!serving && (
            <span className="text-error text-xs">not currently serving</span>
          )}
          <span className="flex-1" />
          {moveButton}
          <button
            type="button"
            className="text-secondary-text hover:text-metro-text px-1 text-sm"
            aria-label={`Move ${entry.routeId} at ${entry.stopId} up`}
            disabled={index === 0}
            onClick={() => moveEntry(list, index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="text-secondary-text hover:text-metro-text px-1 text-sm"
            aria-label={`Move ${entry.routeId} at ${entry.stopId} down`}
            disabled={last}
            onClick={() => moveEntry(list, index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="text-error px-1 text-sm"
            aria-label={`Remove ${entry.routeId} at ${entry.stopId} from ${list === "displayOrder" ? "display order" : "fixed components"}`}
            onClick={() => removeEntry(list, index)}
          >
            ✕
          </button>
        </li>
      );
    }

    return (
      <li
        key={`header-${index}`}
        draggable
        onDragStart={(e) => handleDragStart(list, index, e)}
        onDragOver={(e) => handleDragOver(list, index, e)}
        onDrop={(e) => {
          e.preventDefault();
          handleDragEnd();
        }}
        onDragEnd={handleDragEnd}
        className={
          "flex items-center gap-3 bg-gray-100 px-3 py-2" +
          (dragging ? " opacity-50" : "")
        }
      >
        <span
          className="text-secondary-text cursor-grab select-none"
          aria-hidden="true"
        >
          ⠿
        </span>
        <span className="text-secondary-text text-xs font-bold uppercase">
          Header
        </span>
        <input
          className={INPUT_CLASS + " flex-1"}
          value={entry.text}
          aria-label={`Header ${index + 1} text`}
          onChange={(e) => updateHeaderText(list, index, e.target.value)}
        />
        {moveButton}
        <button
          type="button"
          className="text-secondary-text hover:text-metro-text px-1 text-sm"
          aria-label="Move header up"
          disabled={index === 0}
          onClick={() => moveEntry(list, index, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="text-secondary-text hover:text-metro-text px-1 text-sm"
          aria-label="Move header down"
          disabled={last}
          onClick={() => moveEntry(list, index, 1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="text-error px-1 text-sm"
          aria-label="Remove header"
          onClick={() => removeEntry(list, index)}
        >
          ✕
        </button>
      </li>
    );
  }

  // --- Render ---

  if (!signs) {
    return (
      <div className="m-auto w-11/12 max-w-4xl py-8">
        {loadError ? (
          <p className="text-error font-bold">Failed to load: {loadError}</p>
        ) : (
          <p className="text-secondary-text">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="m-auto w-11/12 max-w-4xl py-6">
      <h1 className="text-metro-text text-2xl font-bold">Screen signs</h1>
      <p className="text-secondary-text mt-1 text-sm">
        Edits <code>src/data/screenSigns.json</code> — the config behind the
        arrival-board pages at <code>/screens/&lt;signId&gt;</code>. Boards
        render at the sign's pixel dimensions and paginate their display order
        when it overflows.
      </p>

      {/* Sign selector */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isNew ? (
          <>
            <label
              className="text-secondary-text text-sm font-bold"
              htmlFor="new-sign-slug"
            >
              Sign slug:
            </label>
            <input
              id="new-sign-slug"
              className={INPUT_CLASS + " min-w-64"}
              value={newSlug}
              placeholder="e.g. union-station-east-tower"
              onChange={(e) => setNewSlug(e.target.value)}
            />
            {slugInvalid && (
              <span className="text-error text-sm">
                Slug must be lowercase letters, digits, and hyphens.
              </span>
            )}
            {!slugInvalid && slugTaken && (
              <span className="text-error text-sm">
                A sign with this slug already exists — saving will replace it.
              </span>
            )}
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={cancelNewSign}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <select
              className={SELECT_CLASS + " min-w-56"}
              value={signId ?? ""}
              onChange={(e) => selectSign(e.target.value)}
            >
              {signs.length === 0 && (
                <option value="">No signs configured</option>
              )}
              {signs.map((sign) => (
                <option key={sign.signId} value={sign.signId}>
                  {sign.signId} — {sign.stopCount}
                  {sign.stopCount === 1 ? " stop" : " stops"},{" "}
                  {sign.displayOrderCount} display entries
                  {sign.dimensions &&
                    `, ${sign.dimensions.width}×${sign.dimensions.height}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={startNewSign}
            >
              New sign…
            </button>
            {signId && (
              <>
                <button
                  type="button"
                  className="border-error text-error hover:bg-xlight-red rounded border px-2 py-1"
                  onClick={deleteSign}
                >
                  Delete…
                </button>
                <a
                  className="border-blue text-blue hover:bg-light-blue rounded-sm border px-2 py-1 text-sm"
                  href={`/screens/${signId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Show public page ↗
                </a>
              </>
            )}
          </>
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
      ) : draft ? (
        <div className="mt-6 space-y-10">
          {/* Stop IDs */}
          <section>
            <h2 className="text-metro-text text-lg font-bold">Stop IDs</h2>
            <p className="text-secondary-text mb-3 text-sm">
              The stops whose routes can appear on the sign — only routes listed
              in the display order below are displayed. Only top-level stops are
              valid — parent stations (e.g. 80214S) or standalone stops (e.g.
              3300), never child platforms.
            </p>
            <ul className="border-border-light divide-border-light divide-y rounded-md border bg-white">
              {draft.stopIds.map((stopId) => {
                const info = stopInfoRef.current.get(stopId);
                return (
                  <li
                    key={stopId}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="font-mono text-sm">{stopId}</span>
                    <span className="text-secondary-text text-sm">
                      {info?.stopName || "—"}
                    </span>
                    {info?.isParentStation && (
                      <span className="border-blue text-blue rounded-sm border px-1.5 py-0.5 text-xs">
                        station
                      </span>
                    )}
                    {info && !info.found && (
                      <span className="text-error text-xs font-bold">
                        not found in GTFS
                      </span>
                    )}
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="text-error px-1 text-sm"
                      aria-label={`Remove stop ${stopId}`}
                      onClick={() => removeStop(stopId)}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
              {draft.stopIds.length === 0 && (
                <li className="text-secondary-text px-3 py-2 text-sm">
                  No stops yet — search below to add one.
                </li>
              )}
            </ul>

            {/* Add-stop lookup */}
            <div className="mt-3">
              <input
                className={INPUT_CLASS + " min-w-64"}
                value={stopQuery}
                placeholder="Search stops by name or ID…"
                onChange={(e) => setStopQuery(e.target.value)}
              />
              {stopSearchError && (
                <p className="text-error mt-1 text-sm">
                  Search failed: {stopSearchError}
                </p>
              )}
              {stopResults !== null && (
                <ul className="border-border-light divide-border-light mt-2 divide-y rounded-md border bg-white">
                  {stopResults.length === 0 && (
                    <li className="text-secondary-text px-3 py-2 text-sm">
                      No matching top-level stops.
                    </li>
                  )}
                  {stopResults.map((stop) => {
                    const added = draft?.stopIds.includes(stop.stopId) ?? false;
                    return (
                      <li key={stop.stopId}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                          disabled={added}
                          onClick={() => addStop(stop)}
                        >
                          <span className="text-metro-text text-sm">
                            {stop.stopName}
                          </span>
                          <span className="text-secondary-text font-mono text-xs">
                            {stop.stopId}
                          </span>
                          {stop.isParentStation && (
                            <span className="border-blue text-blue rounded-sm border px-1.5 py-0.5 text-xs">
                              station
                            </span>
                          )}
                          <span className="flex-1" />
                          {added ? (
                            <span className="text-secondary-text text-sm">
                              Added
                            </span>
                          ) : (
                            <span className="text-link text-sm">Add</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Dimensions & pagination */}
          <section>
            <h2 className="text-metro-text text-lg font-bold">
              Screen dimensions &amp; pagination
            </h2>
            <p className="text-secondary-text mb-3 text-sm">
              The sign page renders a fixed-size board of exactly these pixel
              dimensions (default 1920×1080), scaled down to fit smaller browser
              windows for previewing. When the display order overflows the space
              left after the fixed components, it splits into pages that rotate
              on the interval, with progress dots at the bottom of the board.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="text-secondary-text text-sm font-bold"
                htmlFor="screen-width"
              >
                Width (px)
              </label>
              <input
                id="screen-width"
                className={INPUT_CLASS + " w-28"}
                type="number"
                min={SCREEN_DIMENSIONS_MIN}
                max={SCREEN_DIMENSIONS_MAX}
                value={draft.dimensions.width}
                onChange={(e) => setDimension("width", e.target.value)}
              />
              <label
                className="text-secondary-text text-sm font-bold"
                htmlFor="screen-height"
              >
                Height (px)
              </label>
              <input
                id="screen-height"
                className={INPUT_CLASS + " w-28"}
                type="number"
                min={SCREEN_DIMENSIONS_MIN}
                max={SCREEN_DIMENSIONS_MAX}
                value={draft.dimensions.height}
                onChange={(e) => setDimension("height", e.target.value)}
              />
              <label
                className="text-secondary-text text-sm font-bold"
                htmlFor="screen-interval"
              >
                Page interval (seconds)
              </label>
              <input
                id="screen-interval"
                className={INPUT_CLASS + " w-28"}
                type="number"
                min={PAGINATION_INTERVAL_MIN_MS / 1000}
                max={PAGINATION_INTERVAL_MAX_MS / 1000}
                value={draft.intervalMs / 1000}
                onChange={(e) => setIntervalSeconds(e.target.value)}
              />
            </div>
            {paginationEstimate && (
              <p className="text-secondary-text mt-2 text-sm">
                {draft.displayOrder.length === 0
                  ? "No paginated components yet."
                  : paginationEstimate.rowsPerPage > 0
                    ? `≈ ${paginationEstimate.rowsPerPage} route rows per page → ${paginationEstimate.pageCount} ${paginationEstimate.pageCount === 1 ? "page" : "pages"} at ${draft.dimensions.width}×${draft.dimensions.height}.`
                    : "No route rows fit — increase the height or trim the fixed components."}{" "}
                Estimate only — an entry without a direction can expand into
                multiple rows on the built page.
              </p>
            )}
          </section>

          {/* Fixed components */}
          <section>
            <h2 className="text-metro-text text-lg font-bold">
              Fixed components (always visible)
            </h2>
            <p className="text-secondary-text mb-3 text-sm">
              Rendered in a fixed zone at the top of the board, above the
              paginated display order — use them for the sign’s title or
              branding. Same component types as the display order; a route-stop
              pair may not appear in both lists. Their height reduces the space
              available for paginated pages.
            </p>
            <ul className="border-border-light divide-border-light divide-y rounded-md border bg-white">
              {draft.fixedComponents.map((entry, index) =>
                renderEntryRow(
                  "fixedComponents",
                  entry,
                  index,
                  index === draft.fixedComponents.length - 1,
                ),
              )}
              {draft.fixedComponents.length === 0 && (
                <li className="text-secondary-text px-3 py-2 text-sm">
                  Nothing fixed — every component paginates.
                </li>
              )}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className={INPUT_CLASS + " min-w-56"}
                placeholder="Fixed header text (e.g. Union Station)…"
                value={fixedHeaderText}
                onChange={(e) => setFixedHeaderText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addHeader("fixedComponents", fixedHeaderText);
                    setFixedHeaderText("");
                  }
                }}
              />
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={fixedHeaderText.trim() === ""}
                onClick={() => {
                  addHeader("fixedComponents", fixedHeaderText);
                  setFixedHeaderText("");
                }}
              >
                Add fixed header
              </button>
            </div>
          </section>

          {/* Display order */}
          <section>
            <h2 className="text-metro-text text-lg font-bold">
              Display order (paginated)
            </h2>
            <p className="text-secondary-text mb-3 text-sm">
              Exactly what the sign displays, in order — drag rows or use the
              arrows to arrange. Route-stop rows render one exact (route, stop)
              pair — use them to show a route at just one of several nearby
              stops and intentionally exclude duplicates. Entries that no longer
              serve the sign’s stops are kept and flagged; the sign page skips
              them. Headers render as full-width section headings. When this
              list overflows the screen it splits into rotating pages; saving
              writes the full list to <code>displayOrder</code>.
            </p>
            <ul className="border-border-light divide-border-light divide-y rounded-md border bg-white">
              {draft.displayOrder.map((entry, index) =>
                renderEntryRow(
                  "displayOrder",
                  entry,
                  index,
                  index === draft.displayOrder.length - 1,
                ),
              )}

              {draft.displayOrder.length === 0 && (
                <li className="text-secondary-text px-3 py-2 text-sm">
                  Nothing on the sign yet — add routes from the list below or
                  insert a header.
                </li>
              )}
            </ul>

            {/* Add header */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className={INPUT_CLASS + " min-w-56"}
                placeholder="Header text (e.g. Bus Arrivals)…"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHeader("displayOrder", headerText);
                }}
              />
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={headerText.trim() === ""}
                onClick={() => {
                  addHeader("displayOrder", headerText);
                  setHeaderText("");
                }}
              >
                Add header
              </button>
            </div>
          </section>

          {/* Available route-stop pairs */}
          <section>
            <h2 className="text-metro-text text-lg font-bold">
              Available route-stop pairs
            </h2>
            <p className="text-secondary-text mb-3 text-sm">
              Route-stop pairs serving the selected stops but not included in
              the fixed components or display order — one entry per (route,
              stop), so you can add the exact pair the sign should show and
              intentionally exclude duplicates when several nearby stops serve
              the same route. Adding one appends it to the end of the display
              order above.
            </p>
            <ul className="border-border-light divide-border-light divide-y rounded-md border bg-white">
              {availablePairs.length === 0 ? (
                <li className="text-secondary-text px-3 py-2 text-sm">
                  No additional route-stop pairs serve the selected stops.
                </li>
              ) : (
                availablePairs.map((pair) => (
                  <li
                    key={`${pair.routeId}:${pair.stopId}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <RouteBadge
                      routeId={pair.routeId}
                      routeType={pair.routeType}
                      name={pair.label}
                      color={pair.routeColor}
                      textColor={pair.routeTextColor}
                    />
                    <span className="text-secondary-text text-sm">
                      {pair.headsigns.join(" / ") || pair.longName}
                    </span>
                    <span className="text-metro-text text-sm">
                      {pair.stopName}
                    </span>
                    <span className="text-secondary-text font-mono text-xs">
                      {pair.stopId}
                    </span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="text-link text-sm"
                      onClick={() => addPair(pair)}
                    >
                      Add
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* Save */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={
                saveState === "saving" ||
                !dirty ||
                (isNew && (trimmedSlug === "" || slugInvalid))
              }
              onClick={save}
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
            {saveState === "saved" && !dirty && (
              <span className="text-secondary-text text-sm">Saved</span>
            )}
            {saveState === "error" && (
              <span className="text-error text-sm whitespace-pre-wrap">
                {saveError}
              </span>
            )}
          </div>
        </div>
      ) : signs.length === 0 ? (
        <p className="text-secondary-text mt-8">
          No screen signs configured yet — create one with the “New sign…”
          button.
        </p>
      ) : (
        <p className="text-secondary-text mt-8">Loading sign…</p>
      )}
    </div>
  );
}
