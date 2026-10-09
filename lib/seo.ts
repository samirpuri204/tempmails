// Shared structured-data helpers.
//
// Every JSON-LD block builds its URLs from siteOrigin() so the canonical host
// is the only host ever emitted, matching the rule in lib/site-url.ts.
import { siteOrigin } from "./site-url";

/**
 * Brand name reported to search engines. Google reads WebSite.name and
 * og:site_name to decide the site name shown above the URL in a result, and
 * falls back to the bare domain when neither is present.
 */
export const SITE_NAME = "TempMails";

/**
 * Alternate spellings of the brand. Deliberately excludes every domain form
 * (tempmails.live, TempMails.live): Google may choose any alternateName as the
 * displayed site name, and the goal is to show the brand, not the domain.
 */
export const SITE_ALTERNATE_NAMES = ["Temp Mails"];

/**
 * Name of the editorial hub. Single source of truth: the visible H1, the
 * Open Graph title, the CollectionPage name and the breadcrumb all read from
 * here, so the page cannot describe itself one way and title itself another.
 */
export const JOURNAL_NAME = "The TempMails Journal";

/**
 * Title tag for the journal hub. The H1 stays `JOURNAL_NAME`; the title adds
 * the descriptive clause searchers actually type.
 */
export const JOURNAL_TITLE = `${JOURNAL_NAME}: Email Privacy & Safety Guides`;

/**
 * Titles that already name the brand are emitted as-is; every other title keeps
 * the root layout's "%s | TempMails" template. Without this, a page title such
 * as "About TempMails" renders as "About TempMails | TempMails".
 */
export function pageTitle(title: string): string | { absolute: string } {
  return title.includes(SITE_NAME) ? { absolute: title } : title;
}

/**
 * Absolute URL for an asset path stored in settings. Returns "" when unset so
 * callers can omit the property rather than emit an empty string.
 */
export function absoluteAsset(path: string): string {
  if (!path) return "";
  if (path.startsWith("https://")) return path;
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export type Crumb = { name: string; path: string };

/**
 * BreadcrumbList for a page trail, mirroring the visible breadcrumb rendered
 * by ContentShell ("Home / <title>") so the markup never contradicts the page.
 * Without this, Google shows the raw URL in place of a readable breadcrumb.
 */
export function breadcrumbSchema(trail: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item:
        crumb.path === "/"
          ? siteOrigin()
          : `${siteOrigin()}${crumb.path.startsWith("/") ? crumb.path : `/${crumb.path}`}`,
    })),
  };
}

/**
 * ItemList of the site's primary pages.
 *
 * The footer links these too, but a footer is where crawlers look last. Naming
 * them as a navigation list makes the operator-describing pages (/about,
 * /company), the roadmap and the policies first-class entries rather than links
 * a crawler has to infer from anchor text. Every URL is built from
 * `siteOrigin()`, so the list can never point at a different host to the
 * canonicals.
 */
export function siteNavigationSchema(siteName: string) {
  const pages: [string, string][] = [
    ["Home", "/"],
    ["About", "/about"],
    ["Company information", "/company"],
    ["AI roadmap", "/ai-roadmap"],
    ["Contact", "/contact"],
    ["Guides", "/blog"],
    ["Frequently asked questions", "/faq"],
    ["Privacy policy", "/privacy"],
    ["Terms of service", "/terms"],
    ["Acceptable use policy", "/acceptable-use"],
  ];
  const origin = siteOrigin();
  return {
    "@type": "ItemList",
    "@id": `${origin}/#navigation`,
    name: `${siteName}: main pages`,
    itemListElement: pages.map(([name, path], index) => ({
      "@type": "SiteNavigationElement",
      position: index + 1,
      name,
      url: path === "/" ? origin : `${origin}${path}`,
    })),
  };
}
