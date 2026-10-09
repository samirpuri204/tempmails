// Single source of truth for the canonical site origin. Every canonical tag,
// Open Graph URL, JSON-LD URL, sitemap entry and redirect must be built from
// here so the site can never emit a second hostname (www, http, or a Vercel
// preview domain) and never emit a double slash.

const FALLBACK_ORIGIN = "https://tempmails.live";

/**
 * Canonical origin: always HTTPS, never www, and never with a trailing slash.
 * `URL.origin` intentionally has no trailing slash so callers can safely do
 * `${siteOrigin()}${path}`.
 */
export function siteOrigin(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return FALLBACK_ORIGIN;
  try {
    const url = new URL(raw);
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./, "");
    return url.origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

/**
 * Absolute canonical URL for an application path.
 * `siteUrl()` → "https://tempmails.live", `siteUrl("/blog")` → "https://tempmails.live/blog".
 */
export function siteUrl(path = "/"): string {
  if (path === "/" || path === "") return siteOrigin();
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
