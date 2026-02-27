/// <reference path="../.astro/types.d.ts" />

interface Window {
  dataLayer?: { push: (...args: unknown[]) => void };
}
