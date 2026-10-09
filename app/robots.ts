import type { MetadataRoute } from "next";
import { publicIndexSettings, robotsRules } from "@/lib/seo-urls";
import { siteOrigin } from "@/lib/site-url";

// Revalidate the crawler response every 10 minutes instead of per-request
// database reads; robots.txt is fetched by many crawlers far more often than
// settings change.
export const revalidate = 600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsRules({ ...(await publicIndexSettings()), base: siteOrigin() });
}
