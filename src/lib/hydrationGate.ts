/**
 * Resolves once every SSR'd Astro island on the page has finished hydrating,
 * guaranteeing that React's initial reconciliation pass is complete before any
 * store writes occur.
 *
 * Watcher functions (`watchAlerts`, `watchAlertStatus`, `watchPredictions`)
 * await this before committing fetched data to nanostores, preventing the
 * race condition where a fast (e.g. cached) API response updates a store
 * while React is still reconciling SSR HTML with the client VDOM.
 *
 * Implementation: Astro renders each `client:load` island as
 * `<astro-island ssr …>` in the static HTML, and removes the `ssr` attribute
 * from that element once hydration is complete. A MutationObserver watches
 * every such element; the Promise resolves when the last `ssr` attribute is
 * removed, meaning all islands are done. This is more reliable than
 * `requestAnimationFrame` alone, which can fire before Astro's async dynamic
 * import of the component chunk resolves.
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
    _resolve();
  } else {
    let remaining = pendingIslands.length;
    const onIslandHydrated = () => {
      if (--remaining === 0) _resolve();
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
  console.log("App hyrdated");
  _resolve();
}
