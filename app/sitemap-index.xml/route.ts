import { escapeXml } from "@/lib/sitemap-xml";
import { siteOrigin } from "@/lib/site-url";

export const dynamic = "force-static";

// Compatibility alias: an earlier Search Console submission may still point
// here, so keep it fetchable without a redirect. robots.txt advertises the
// real URL set (`/sitemap.xml`) instead, so there is only one advertised
// sitemap.
export function GET(): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${escapeXml(`${siteOrigin()}/sitemap.xml`)}</loc></sitemap></sitemapindex>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
