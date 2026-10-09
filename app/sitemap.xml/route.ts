import { escapeXml } from "@/lib/sitemap-xml";
import { db } from "@/lib/db";
import { publicIndexSettings, sitemapEntries } from "@/lib/seo-urls";
import { siteOrigin } from "@/lib/site-url";

// Cache the public URL list for ten minutes.
export const revalidate = 600;

function xml(entries: ReturnType<typeof sitemapEntries>): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastModified
        ? `<lastmod>${new Date(e.lastModified).toISOString()}</lastmod>`
        : "";
      return `<url><loc>${escapeXml(e.url)}</loc>${lastmod}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export async function GET(): Promise<Response> {
  try {
    const s = await publicIndexSettings();
    if (!s.index || !s.sitemapEnabled) return new Response(xml([]), sitemapHeaders());
    const [pages, posts] = await Promise.all([
      db.seoPage.findMany(),
      db.blogPost.findMany({ where: { published: true } }),
    ]);
    return new Response(
      xml(sitemapEntries(siteOrigin(), pages, posts)),
      sitemapHeaders(),
    );
  } catch {
    // Without a database, serve the static content pages with no dates rather
    // than an empty sitemap.
    return new Response(
      xml(sitemapEntries(siteOrigin(), [], [])),
      sitemapHeaders(),
    );
  }
}

function sitemapHeaders(): ResponseInit {
  return {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=600, must-revalidate",
    },
  };
}
