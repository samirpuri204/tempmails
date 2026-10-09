import type { NextConfig } from "next";
import type { Redirect } from "next/dist/lib/load-custom-routes";
// Shared canonical origin: never www, never http, never a trailing slash, so
// redirect destinations cannot emit a double slash.
import { siteOrigin } from "./lib/site-url";

const site = siteOrigin();

// Legacy URL map — the paths the previous site exposed, which Search Console
// still reports under "Not found (404)" and "Discovered – currently not
// indexed". Each one 308s to the closest page that actually exists, which is
// the only signal that both drains those buckets and keeps the old URL's crawl
// signal on the canonical host instead of discarding it at a dead end.
//
// Declared here rather than seeded into the `Redirect` database table for
// three reasons: it is a fixed historical map, it must still work during a
// database outage, and `/post/:slug*` is multi-segment — the `[slug]` route
// that reads that table matches a single segment only, so it could never serve
// these URLs.
//
// Order matters: every specific entry must precede the `/post/:slug*`
// catch-all, so unmapped old journal URLs land on the journal hub on the
// canonical host rather than 404ing.
const legacyRedirects: Redirect[] = [
  { source: "/get-started", destination: "/", permanent: true },
  { source: "/free-temp-mail", destination: "/", permanent: true },
  { source: "/terms-and-conditions", destination: "/terms", permanent: true },
  { source: "/privacy-policy", destination: "/privacy", permanent: true },
  { source: "/cookies-policy", destination: "/privacy", permanent: true },
  // The AI roadmap was requested under two names. `/ai-roadmap` is the page;
  // the shorter spelling redirects so a link either way resolves.
  { source: "/roadmap", destination: "/ai-roadmap", permanent: true },
  {
    source: "/post/how-long-does-temporary-email-last",
    destination: "/how-long-does-temp-mail-last",
    permanent: true,
  },
  {
    source: "/post/best-uses-for-temporary-email",
    destination: "/temporary-email",
    permanent: true,
  },
  {
    source: "/post/how-does-temporary-email-work",
    destination: "/how-it-works",
    permanent: true,
  },
  {
    source: "/post/how-to-create-temporary-email",
    destination: "/how-it-works",
    permanent: true,
  },
  {
    source: "/post/how-to-use-temporary-email",
    destination: "/how-it-works",
    permanent: true,
  },
  { source: "/post/:slug*", destination: "/blog", permanent: true },
];

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["mailparser"],
  // Canonical URLs never carry a trailing slash; `/blog/` redirects to
  // `/blog` so the two spellings cannot both be crawled.
  trailingSlash: false,
  async redirects(): Promise<Redirect[]> {
    const rules: Redirect[] = [
      // Dead legacy paths first: they are exact, they exist only to retire a
      // stale URL, and nothing later in this list should be able to shadow one
      // of them.
      ...legacyRedirects,
      // The previous site exposed language-prefixed URLs (/en, /ne and
      // subpaths). Those routes do not exist here — locales are client-side
      // dictionaries, not paths — and returning 404 leaves stale duplicate
      // entries in the index.
      //
      // The subpath is preserved rather than collapsed onto the homepage: a
      // deep URL that redirects to "/" behaves like a soft 404 and discards
      // whatever signal the old URL carried. `/en/faq` and `/ne/faq` both now
      // resolve to `/faq`, the closest equivalent that actually exists.
      { source: "/:lang(en|ne)", destination: "/", permanent: true },
      { source: "/:lang(en|ne)/:path*", destination: "/:path*", permanent: true },
    ];

    // In production, redirect any non-canonical hostname (including
    // www. and direct HTTP) to the canonical HTTPS origin.
    if (process.env.NODE_ENV === "production") {
      rules.push(
        {
          source: "/:path*",
          has: [{ type: "host", value: "www.tempmails.live" }],
          destination: `${site}/:path*`,
          permanent: true,
        },
        {
          source: "/:path*",
          has: [
            { type: "host", value: "tempmails.live" },
            { type: "header", key: "x-forwarded-proto", value: "http" },
          ],
          destination: `${site}/:path*`,
          permanent: true,
        }
      );
    }

    return rules;
  },
  async headers() {
    const headers: Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }> = [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // Ad networks verify the zone against the referring origin. This
          // sends only scheme+host cross-origin (never a path or query);
          // message links still open from a no-referrer sandboxed iframe.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // XML sitemaps are crawl instructions, not pages. Search Console listed
      // them under "Crawled – currently not indexed" purely because nothing
      // declared an intent, so declare one: the file stays fully fetchable
      // (crawlability and indexability are separate signals — this blocks only
      // the second) while it can never be served as a search result.
      {
        source: "/sitemap.xml",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/sitemap-index.xml",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      // Reserved application segments. These return 404 today, so this is
      // defence in depth: if a route is ever added under one of them it cannot
      // be indexed by accident. robots.txt also disallows them, but robots.txt
      // is a crawl control, not an indexation control — this header is.
      //
      // The alternation below is deliberately the same five segments as
      // PRIVATE_PATHS in lib/seo-urls.ts and NEVER_INDEX in
      // scripts/seo-check.mjs. `/api/:path*` and `/admin/:path*` above already
      // carry these headers; repeating api and admin here keeps the three lists
      // identical, so a drift check can compare them directly.
      {
        source: "/:reserved(api|admin|inbox|auth|recover)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:reserved(api|admin|inbox|auth|recover)/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];

    // Protect Vercel preview deployments and branch deployments from being
    // indexed. Only the production environment may be indexed.
    if (process.env.VERCEL_ENV !== "production") {
      headers.push({
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      });
    }

    return headers;
  },
};
export default config;
