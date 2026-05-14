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
 * writes race with React.
 *
 * MULTI-CYCLE RECONCILIATION: React 18's concurrent scheduler works in 5 ms
 * time slices. Complex component trees (e.g. Headless UI's TabGroup with its
 * ARIA management, focus ring, and panel visibility logic) can exceed one slice,
 * causing React to schedule *multiple* MessageChannel macrotasks to finish
 * reconciliation. A single `setTimeout(0)` only guarantees we run after the
 * *first* such task, leaving subsequent chunks racing with store writes.
 *
 * Using `requestAnimationFrame` as the outer defer solves this: rAF fires only
 * after the browser has completed all pending rendering work for the current
 * frame — including every React scheduler chunk — so by the time the rAF
 * callback runs, React's full reconciliation is guaranteed to be done. The
 * inner `setTimeout(0)` then drains any final microtask queues before
 * `_resolve()` is called.
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
        // React 18 schedules hydration work via MessageChannel macrotasks and
        // may chunk complex trees across multiple scheduler cycles. rAF fires
        // after the browser has finished all pending rendering work for the
        // current frame (including every React scheduler chunk), so by the
        // time our rAF callback runs, reconciliation is fully complete.
        // The inner setTimeout(0) then drains any residual microtask queues
        // before we open the gate.
        requestAnimationFrame(() => {
          setTimeout(() => {
            console.log("[hydrationGate] all islands hydrated, gate resolved");
            _resolve();
          }, 0);
        });
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
