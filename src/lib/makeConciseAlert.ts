import type { SwiftlyAlert } from "./fetchSwiftlyAlerts";
import type { ConciseAlert } from "../pages/api/alerts";

/**
 * Convert a full SwiftlyAlert into the minimal `ConciseAlert` shape,
 * converting the first active-period datetime strings to POSIX timestamps
 * (seconds) as the GTFS spec requires.
 */
export function makeConciseAlert(fullAlert: SwiftlyAlert): ConciseAlert {
  const rawPeriod = fullAlert.activePeriods[0];
  return {
    activePeriod: {
      start: Math.floor(new Date(rawPeriod.start).getTime() / 1000),
      end:
        rawPeriod.end !== null
          ? Math.floor(new Date(rawPeriod.end).getTime() / 1000)
          : null,
    },
    headerText: fullAlert.headerText,
    descriptionText: fullAlert.descriptionText,
    effect: fullAlert.effect,
    cause: fullAlert.cause,
    informedEntities: fullAlert.informedEntities,
  };
}
