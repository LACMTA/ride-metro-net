/**
 * Returns a `Cache-Control` header string appropriate for the current
 * environment. In development, returns `no-store` to prevent caching
 * issues during local development. In production, returns a
 * `max-age`/`s-maxage` combo so the browser caches for a short TTL while
 * a CDN/reverse proxy can cache for longer.
 *
 * @param clientMaxAge - Browser cache TTL in seconds (default: 3600 = 1 hour).
 * @param serverMaxAge - Shared/CDN cache TTL in seconds (default: 31536000 = 1 year).
 */
export function prodCacheHeader(
  clientMaxAge = 3600,
  serverMaxAge = 31536000,
): string {
  if (import.meta.env.PROD) {
    return `public, max-age=${clientMaxAge}, s-maxage=${serverMaxAge}`;
  }
  return "no-store";
}
