import type { ConciseAlert } from "../pages/api/alerts";

/**
 * Checks whether an alert is current based on its `activePeriod`.
 *
 * An alert is considered current if the current time falls within the
 * `activePeriod`'s `start` and `end` bounds (both inclusive). Either bound
 * may be absent:
 *   - No `start` → the period has already begun (open-ended in the past).
 *   - No `end`   → the period has no scheduled end (open-ended in the future).
 *   - No `activePeriod` at all → treated as always current.
 *
 * Timestamps in `TimeRange` are Unix epoch seconds.
 */
export function isCurrent(
  alert: Pick<ConciseAlert, "activePeriod">,
  now: Date = new Date(),
): boolean {
  const { activePeriod } = alert;

  if (!activePeriod) return true;

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const { start, end } = activePeriod;

  if (start !== undefined && nowSeconds < start) return false;
  if (end != null && nowSeconds > end) return false;

  return true;
}
