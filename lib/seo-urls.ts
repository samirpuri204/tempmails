import type { MetadataRoute } from "next";
import { articles } from "./content";
import { settings } from "./settings";

type PageRow = { slug: string; published: boolean; updatedAt: Date };
type PostRow = { slug: string; published: boolean; updatedAt: Date; publishedAt?: Date | null };

// Application routes that must never be offered to crawlers.
// Keep in sync with the disallow list in robotsRules() and with the
// X-Robots-Tag header rules in next.config.ts.
export const PRIVATE_PATHS = ["/api/", "/admin/", "/inbox/", "/auth/", "/recover/"];

/**
 * True when a path segment is reserved for the application.
 *
 * `/[slug]` is a catch-all route, so a stored content row could otherwise make
 * a reserved path renderable and indexable. Accepts "inbox", "/inbox",
 * "inbox/abc" and "/inbox/abc" alike.
 */
export function isReservedAppPath(value: string) {
  const withSlash = `/${value.replace(/^\/+/, "")}/`;
  return PRIVATE_PATHS.some((p) => withSlash.startsWith(p));
}

const isPrivate = isReservedAppPath;

// One canonical URL per indexable page. Published database pages join the
// static content pages; unpublished database pages are removed even when they
// shadow a static slug. Slugs that collide with private application routes are
// dropped so the sitemap never contradicts robots.txt or an admin noindex.
export function sitemapEntries(
  base: string,
  pages: PageRow[],
  posts: PostRow[],
): MetadataRoute.Sitemap {
  const slugs = new Set(Object.keys(articles));
  for (const p of pages) {
    if (p.published) slugs.add(p.slug);
    else slugs.delete(p.slug);
  }
  const pageUpdated = new Map(pages.map((p) => [p.slug, p.updatedAt]));
  const livePosts = posts.filter(p => p.published && (!p.publishedAt || p.publishedAt <= new Date()));
  const postUpdated = new Map(livePosts.map((p) => [`blog/${p.slug}`, p.updatedAt]));
  // The journal hub changes whenever its newest entry changes, so it inherits
  // the most recent post date instead of carrying no lastmod at all.
  const journalUpdated = livePosts.reduce<Date | undefined>(
    (newest, p) => (!newest || p.updatedAt > newest ? p.updatedAt : newest),
    undefined,
  );
  const paths = [
    "",
    "blog",
    ...[...slugs].filter((s) => !isPrivate(s)),
    ...postUpdated.keys(),
  ];
  return [...new Set(paths)].map((p) => ({
    url: `${base}/${p}`,
    lastModified: p === "blog"
      ? journalUpdated
      : p.startsWith("blog/")
        ? postUpdated.get(p)
        : pageUpdated.get(p),
  }));
}

// The crawl policy must fail open: if settings cannot be read (database
// outage, cold-start connection hiccup), serve a permissive robots.txt rather
// than a blanket Disallow that crawlers can cache for days.
export async function publicIndexSettings(): Promise<{
  index: boolean;
  sitemapEnabled: boolean;
}> {
  try {
    const s = await settings();
    return { index: s.indexPublicPages, sitemapEnabled: s.sitemapEnabled };
  } catch {
    return { index: true, sitemapEnabled: true };
  }
}

export function robotsRules({
  index,
  sitemapEnabled,
  base,
}: {
  index: boolean;
  sitemapEnabled: boolean;
  base: string;
}): MetadataRoute.Robots {
  return {
    rules: index
      ? { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }
      : { userAgent: "*", disallow: "/" },
    // Advertise exactly one sitemap URL so Search Console never sees two
    // competing submissions. `/sitemap-index.xml` stays fetchable as a
    // compatibility alias for any earlier submission, but it is not
    // advertised: robots.txt points at the real URL set.
    sitemap: index && sitemapEnabled ? `${base}/sitemap.xml` : undefined,
  };
}
