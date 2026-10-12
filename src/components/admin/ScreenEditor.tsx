import { useEffect, useMemo, useRef, useState } from "react";
import RouteBadge from "../RouteBadge";
import type {
  AdminScreenDetail,
  AdminScreenRouteInfo,
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
  routeOrder: string[];
}

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
 * (with a top-level-stop lookup), and drag its routeOrder into shape. All
 * data is fetched at runtime from /admin/api/screens* and saved to
 * src/data/screenSigns.json.
 */
export default function ScreenEditor() {
  const [signs, setSigns] = useState<AdminScreenSummary[] | null>(null);
  const [signId, setSignId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [baseline, setBaseline] = useState<ScreenDraft | null>(null);
  const [draft, setDraft] = useState<ScreenDraft | null>(null);
  const [servingRoutes, setServingRoutes] = useState<AdminScreenRouteInfo[]>(
    [],
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stopQuery, setStopQuery] = useState("");
  const [stopResults, setStopResults] = useState<
    AdminScreenStopLookupResult[] | null
  >(null);
  const [stopSearchError, setStopSearchError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Display-info caches. Written alongside a state update that triggers the
  // next render, so plain refs (no re-render of their own) are fine here.
  const stopInfoRef = useRef<Map<string, StopInfo>>(new Map());
  const routeInfoRef = useRef<Map<string, AdminScreenRouteInfo>>(new Map());

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

  const servingRouteIds = useMemo(
    () => new Set(servingRoutes.map((route) => route.routeId)),
    [servingRoutes],
  );

  /** Loads one sign's editor data; drops the response if the user moved on. */
  async function loadSign(nextSignId: string): Promise<void> {
    setLoadError(null);
    setSaveState("idle");
    setSaveError(null);
    setIsNew(false);
    setDraft(null);
    setBaseline(null);
    setServingRoutes([]);
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
      for (const route of [...detail.servingRoutes, ...detail.staleRoutes]) {
        routeInfoRef.current.set(route.routeId, route);
      }

      setServingRoutes(detail.servingRoutes);

      // Display order: saved routeOrder entries that still serve the sign
      // (in saved order), then serving routes not listed in routeOrder (in
      // sign-page render order), then saved entries that no longer serve
      // (flagged). Saving writes this full arrangement.
      const servingIds = new Set(
        detail.servingRoutes.map((route) => route.routeId),
      );
      const saved = detail.config.routeOrder ?? [];
      const ordered = [
        ...saved.filter((id) => servingIds.has(id)),
        ...detail.servingRoutes
          .map((route) => route.routeId)
          .filter((id) => !saved.includes(id)),
        ...saved.filter((id) => !servingIds.has(id)),
      ];
      const unique = [...new Set(ordered)];

      setBaseline({
        stopIds: [...detail.config.stopIds],
        routeOrder: [...unique],
      });
      setDraft({
        stopIds: [...detail.config.stopIds],
        routeOrder: [...unique],
      });
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
    setDraft({ stopIds: [], routeOrder: [] });
    setBaseline(null);
    setServingRoutes([]);
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
    setServingRoutes([]);
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
  // the routeOrder list stays in sync before anything is saved. Newly
  // serving routes are appended as unlisted rows at the end.
  const draftStopIdsKey = draft?.stopIds.join(",") ?? "";
  useEffect(() => {
    if (!draft || draft.stopIds.length === 0) {
      setServingRoutes([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchJson<{ routes: AdminScreenRouteInfo[] }>(
          `/admin/api/screens/route-preview?stopIds=${encodeURIComponent(draftStopIdsKey)}`,
        );
        if (cancelled) return;
        for (const route of res.routes) {
          routeInfoRef.current.set(route.routeId, route);
        }
        setServingRoutes(res.routes);
        setDraft((prev) => {
          if (!prev) return prev;
          const additions = res.routes
            .map((route) => route.routeId)
            .filter((id) => !prev.routeOrder.includes(id));
          if (additions.length === 0) return prev;
          return { ...prev, routeOrder: [...prev.routeOrder, ...additions] };
        });
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

  /** Reorders the draft routeOrder (used by drag and the arrow buttons). */
  function reorderRoute(from: number, to: number): void {
    setDraft((prev) => {
      if (
        !prev ||
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= prev.routeOrder.length ||
        to >= prev.routeOrder.length
      ) {
        return prev;
      }
      const next = [...prev.routeOrder];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, routeOrder: next };
    });
  }

  function moveRoute(index: number, delta: -1 | 1): void {
    reorderRoute(index, index + delta);
  }

  function removeRoute(routeId: string): void {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            routeOrder: prev.routeOrder.filter((id) => id !== routeId),
          }
        : prev,
    );
  }

  function handleDragStart(index: number, e: React.DragEvent): void {
    e.dataTransfer.effectAllowed = "move";
    // Firefox doesn't start a drag unless data is set.
    e.dataTransfer.setData("text/plain", String(index));
    setDragIndex(index);
  }

  function handleDragOver(index: number, e: React.DragEvent): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || dragIndex === index) return;
    reorderRoute(dragIndex, index);
    setDragIndex(index);
  }

  function handleDragEnd(): void {
    setDragIndex(null);
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
            routeOrder: draft.routeOrder,
          }),
        },
      );
      const saved: ScreenDraft = {
        stopIds: res.stopIds,
        routeOrder: res.routeOrder ?? [],
      };
      setBaseline({
        stopIds: [...saved.stopIds],
        routeOrder: [...saved.routeOrder],
      });
      setDraft({
        stopIds: [...saved.stopIds],
        routeOrder: [...saved.routeOrder],
      });
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
        setServingRoutes([]);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
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
        arrival-board pages at <code>/screens/&lt;signId&gt;</code>.
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
                  {sign.stopCount === 1 ? " stop" : " stops"}
                  {sign.routeOrderCount > 0
                    ? `, ${sign.routeOrderCount} ordered routes`
                    : ""}
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
              Every route serving these stops is merged onto the sign. Only
              top-level stops are valid — parent stations (e.g. 80214S) or
              standalone stops (e.g. 3300), never child platforms.
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

          {/* Route order */}
          <section>
            <h2 className="text-metro-text text-lg font-bold">Route order</h2>
            <p className="text-secondary-text mb-3 text-sm">
              Routes serving this sign’s stops, in display order — drag rows or
              use the arrows to arrange. Rows update as stops are added or
              removed; entries that no longer serve the sign are kept and
              flagged. Saving writes the full list to <code>routeOrder</code>.
            </p>
            <ul className="border-border-light divide-border-light divide-y rounded-md border bg-white">
              {draft.routeOrder.map((routeId, index) => {
                const info = routeInfoRef.current.get(routeId);
                const serving = servingRouteIds.has(routeId);
                return (
                  <li
                    key={routeId}
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    onDragOver={(e) => handleDragOver(index, e)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDragEnd();
                    }}
                    onDragEnd={handleDragEnd}
                    className={
                      "flex items-center gap-3 px-3 py-2" +
                      (dragIndex === index ? " opacity-50" : "")
                    }
                  >
                    <span
                      className="text-secondary-text cursor-grab select-none"
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                    {info && info.known ? (
                      <RouteBadge
                        routeId={routeId}
                        routeType={info.routeType}
                        name={info.label}
                        color={info.routeColor}
                        textColor={info.routeTextColor}
                      />
                    ) : (
                      <span className="border-error text-error rounded-sm border px-1.5 py-0.5 font-mono text-xs">
                        {routeId}
                      </span>
                    )}
                    <span className="text-secondary-text text-sm">
                      {info?.longName}
                    </span>
                    {info && !info.known && (
                      <span className="text-error text-xs font-bold">
                        not in GTFS
                      </span>
                    )}
                    {!serving && (
                      <span className="text-error text-xs">
                        not currently serving
                      </span>
                    )}
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="text-secondary-text hover:text-metro-text px-1 text-sm"
                      aria-label={`Move ${routeId} up`}
                      disabled={index === 0}
                      onClick={() => moveRoute(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-secondary-text hover:text-metro-text px-1 text-sm"
                      aria-label={`Move ${routeId} down`}
                      disabled={index === draft.routeOrder.length - 1}
                      onClick={() => moveRoute(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="text-error px-1 text-sm"
                      aria-label={`Remove ${routeId} from routeOrder`}
                      onClick={() => removeRoute(routeId)}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
              {draft.routeOrder.length === 0 && (
                <li className="text-secondary-text px-3 py-2 text-sm">
                  No routes yet — they appear here once the sign has stops.
                </li>
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
