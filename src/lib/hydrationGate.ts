/**
 * Resolves once every SSR'd Astro island on the page has finished hydrating
 * AND React has completed its initial reconciliation pass, guaranteeing it is
 * safe to write to nanostores without triggering a hydration mismatch.
 *
 * Watcher functions (`watchAlerts`, `watchAlertStatus`, `watchPredictions`)
 * await this before committing fetched data to nanostores, preventing the
 * race condition where a fast (e.g. cached) API response updates a store
 * while React is still reconciling SSR HTML with the client VDOM.
 *
 * Implementation: Astro renders each `client:load` island as
 * `<astro-island ssr …>` in the static HTML, and removes the `ssr` attribute
 * once it has called `hydrateRoot()`. A MutationObserver watches every such
 * element and detects when the last `ssr` attribute is removed.
 *
 * CRITICAL TIMING: Astro removes the `ssr` attribute in the same synchronous
 * block as its `hydrateRoot()` call, but React 18 schedules its actual
 * reconciliation work via `MessageChannel.postMessage()` — a macrotask that
 * is queued *before* the MutationObserver fires. Because MutationObserver
 * callbacks are microtasks, they (and all `await hydrationGate` continuations)
 * would otherwise run *before* React's reconciliation macrotask, letting store
 * writes race with React. Wrapping `_resolve()` in `setTimeout(..., 0)` pushes
 * the gate resolution to a new macrotask. Since the task queue is FIFO, React's
 * already-queued MessageChannel task runs first, completing reconciliation
 * before the gate ever opens.
 *
 * If there are no SSR islands on the page the Promise resolves immediately.
 *
 * After the gate is open, subsequent `await hydrationGate` calls in polling
 * updates resolve as a free microtask — there is no ongoing overhead for the
 * 15-minute poll cycle.
 *
 * In a server/build context (`window` is undefined) the promise resolves
 * immediately, since there is no hydration to wait for.
 */

let _resolve!: () => void;

export const hydrationGate = new Promise<void>((resolve) => {
  _resolve = resolve;
});

if (typeof window !== "undefined") {
  const pendingIslands = Array.from(
    document.querySelectorAll<HTMLElement>("astro-island[ssr]"),
  );

  if (pendingIslands.length === 0) {
    // No SSR islands on this page (e.g. client:only pages), resolve immediately.
    console.log("[hydrationGate] no SSR islands found, resolving immediately");
    _resolve();
  } else {
    let remaining = pendingIslands.length;
    const onIslandHydrated = () => {
      if (--remaining === 0) {
        // React 18 schedules its hydrateRoot reconciliation work via
        // MessageChannel (a macrotask) synchronously inside hydrateRoot(),
        // which Astro calls just before removing the `ssr` attribute.
        // That MessageChannel task is therefore already in the task queue
        // when this MutationObserver microtask fires. Deferring _resolve()
        // with setTimeout(0) adds *our* resolution task after React's task
        // in the FIFO queue, guaranteeing React finishes reconciling before
        // any store writes occur.
        setTimeout(() => {
          console.log("[hydrationGate] all islands hydrated, gate resolved");
          _resolve();
        }, 0);
      }
    };

    for (const island of pendingIslands) {
      const observer = new MutationObserver((_, obs) => {
        if (!island.hasAttribute("ssr")) {
          obs.disconnect();
          onIslandHydrated();
        }
      });
      observer.observe(island, { attributes: true, attributeFilter: ["ssr"] });
    }
  }
} else {
  // SSR/build context — no DOM, no hydration to wait for.
  _resolve();
}
