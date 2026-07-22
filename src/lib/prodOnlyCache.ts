/**
 * Returns the given `Cache-Control` value in production, or
 * `no-cache, no-store, must-revalidate` in development.
 *
 * Uses Astro's `import.meta.env.PROD` flag, which is `true` in production
 * builds and `false` during development (`astro dev`).
 *
 * Usage:
 * ```ts
 * "Cache-Control": productionCache("public, max-age=3600")
 * ```
 */
export function prodOnlyCache(productionValue: string): string {
  return import.meta.env.PROD
    ? productionValue
    : "no-cache, no-store, must-revalidate";
}
