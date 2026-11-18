import screenSignsData from "../data/screenSigns.json";
import type { ScreenSigns, ScreenSignConfig } from "../data/types";

const screenSigns = screenSignsData as ScreenSigns;

/**
 * Returns the full screen-signs config as a typed `ScreenSigns` object.
 */
export function getAllScreenSigns(): ScreenSigns {
  return screenSigns;
}

/**
 * Returns the config for a single screen sign, or `undefined` if no sign
 * with the given `signId` exists.
 */
export function getScreenSign(signId: string): ScreenSignConfig | undefined {
  return screenSigns[signId];
}

/**
 * Returns an array of `{ signId, config }` entries for use in
 * `getStaticPaths()` or directory listings.
 */
export function getScreenSignEntries(): Array<{
  signId: string;
  config: ScreenSignConfig;
}> {
  return Object.entries(screenSigns).map(([signId, config]) => ({
    signId,
    config,
  }));
}