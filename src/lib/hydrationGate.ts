/**
 * Resolves after the browser's first animation frame, guaranteeing that
 * React's initial synchronous hydration pass is complete before any store
 * writes occur.
 *
 * Watcher functions (`watchAlerts`, `watchAlertStatus`, `watchPredictions`)
 * await this before committing fetched data to nanostores, preventing the
 * race condition where a fast (e.g. cached) API response updates a store
 * while React is still reconciling SSR HTML with the client VDOM.
 *
 * After the first frame the Promise is already settled, so subsequent
 * `await hydrationGate` calls in polling updates resolve as a free microtask
 * — there is no ongoing overhead for the 15-minute poll cycle.
 *
 * In a server/build context (`window` is undefined) the promise resolves
 * immediately, since there is no hydration to wait for.
 */

let _resolve!: () => void;

export const hydrationGate = new Promise<void>((resolve) => {
  _resolve = resolve;
});

if (typeof window !== "undefined") {
  requestAnimationFrame(_resolve);
} else {
  _resolve();
}
