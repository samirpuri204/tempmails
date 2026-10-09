// Crawl a deployed TempMails origin and assert the search-facing contract.
//
//   node scripts/seo-check.mjs                                  # production
//   node scripts/seo-check.mjs --base http://127.0.0.1:3111      # a local build
//
// The page list is read from the site's own sitemap, so the check can never go
// stale the way a hardcoded route list does. Writes docs/seo/verification.json
// and exits non-zero on any failure.
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return (i === -1 ? fallback : args[i + 1]).replace(/\/$/, "");
};
// Where to fetch from, and which origin the canonicals are required to name.
// They are the same in production, and differ when checking a local build,
// which must still emit production canonicals rather than localhost ones.
const BASE = arg("--base", "https://tempmails.live");
const CANONICAL = arg("--canonical", "https://tempmails.live");

// Application segments that must never appear in a sitemap, a canonical tag or
// any other search-facing surface. Membership must stay identical to
// PRIVATE_PATHS in lib/seo-urls.ts and to the alternation in the :reserved()
// header rules in next.config.ts; a test asserts the three agree.
const NEVER_INDEX = ["/api", "/admin", "/inbox", "/auth", "/recover"];

const failures = [];
const fail = (scope, message) => failures.push({ scope, message });

const fetchText = async (path) => {
  const r = await fetch(BASE + path, { redirect: "manual" });
  const body = await r.text();
  return { status: r.status, headers: r.headers, body };
};

const inXml = (value) => String(value ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const stripSlash = (u) => String(u ?? "").replace(/\/$/, "");

// ---------------------------------------------------------------- robots.txt
const robots = await fetchText("/robots.txt");
const robotsPassed =
  robots.status === 200 &&
  /(^|\n)Sitemap: /i.test(robots.body) &&
  !/(^|\n)Disallow: \/\s*($|\n)/.test(robots.body) &&
  !/(^|\n)Disallow: \/sitemap/i.test(robots.body) &&
  !/(^|\n)Disallow: \/_next/i.test(robots.body);
if (!robotsPassed) fail("robots.txt", "must allow crawling, expose the sitemap, and never block /sitemap.xml or /_next");
if (/(^|\n)Disallow: \/$/m.test(robots.body)) fail("robots.txt", "blanket Disallow: / found");

// ------------------------------------------------------------------ sitemap
const sitemap = await fetchText("/sitemap.xml");
if (sitemap.status !== 200) fail("sitemap.xml", `status ${sitemap.status}`);
if (!/application\/xml/.test(sitemap.headers.get("content-type") || "")) fail("sitemap.xml", "content type is not XML");
const locs = [...sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => inXml(m[1]));
if (new Set(locs).size !== locs.length) fail("sitemap.xml", "duplicate <loc> entries");
for (const url of locs) {
  if (!url.startsWith("https://")) fail("sitemap.xml", `non-HTTPS or relative loc: ${url}`);
  if (url.startsWith("http://")) fail("sitemap.xml", `HTTP variant in sitemap: ${url}`);
  if (/[?#]/.test(url)) fail("sitemap.xml", `query or fragment in sitemap: ${url}`);
  if (url.includes("://www.")) fail("sitemap.xml", `www variant in sitemap: ${url}`);
  const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  if (NEVER_INDEX.some((p) => path === p || path.startsWith(`${p}/`))) fail("sitemap.xml", `non-indexable path listed: ${url}`);
}
// Every advertised entry must live on the canonical origin.
const canonicalHost = new URL(CANONICAL).host;
for (const url of locs) if (new URL(url).host !== canonicalHost) fail("sitemap.xml", `host mismatch: ${url}`);

// -------------------------------------------------------------- every page
const index = await fetchText("/sitemap-index.xml");
const indexPassed = index.status === 200 && index.body.includes("<sitemapindex") && index.body.includes(`<loc>${CANONICAL}/sitemap.xml</loc>`);
if (!indexPassed) fail("sitemap-index.xml", "compatibility alias must be fetchable and point at /sitemap.xml");

const pages = [];
for (const url of locs) {
  const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  const { status, body: html } = await fetchText(path);
  if (status !== 200) { fail(path, `status ${status}`); pages.push({ path, status }); continue; }

  const meta = (name, attr = "name") =>
    inXml(html.match(new RegExp(`<meta ${attr}="${name}" content="(.*?)"`))?.[1]);
  const prop = (p) => meta(p, "property");

  const title = inXml(html.match(/<title>(.*?)<\/title>/s)?.[1]);
  const canonical = inXml(html.match(/<link rel="canonical" href="(.*?)"/)?.[1]);
  const robotsMeta = meta("robots");
  const h1Count = [...html.matchAll(/<h1(?:\s[^>]*)?>/g)].length;

  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map((m) => m[1]);
  const parsed = [];
  for (const block of blocks) { try { parsed.push(JSON.parse(block)); } catch { fail(path, "invalid JSON-LD"); } }
  const types = parsed.flatMap((n) => [].concat(n["@type"] ?? [], (n["@graph"] ?? []).flatMap((g) => [].concat(g["@type"] ?? []))));
  const hasFaqOnPage = /Common questions/i.test(html);

  const checks = {
    canonicalSelf: stripSlash(canonical) === stripSlash(CANONICAL + path),
    canonicalAbsolute: canonical?.startsWith("https://") ?? false,
    indexable: /index/.test(robotsMeta) && !/noindex/.test(robotsMeta),
    singleH1: h1Count === 1,
    titlePresent: !!title && title.length <= 60,
    descriptionPresent: !!meta("description"),
    ogTitle: !!prop("og:title"),
    ogDescription: !!prop("og:description"),
    ogUrl: !!prop("og:url"),
    ogType: !!prop("og:type"),
    ogSiteName: !!prop("og:site_name"),
    ogImage: !!prop("og:image"),
    twitterCard: /summary(_large_image)?/.test(meta("twitter:card")),
    // The root is not part of any trail, so it carries no BreadcrumbList.
    breadcrumbs: path === "/" || types.includes("BreadcrumbList"),
    // Markup must describe what is on the page: a page with a visible Q&A block
    // is typed FAQPage, and a page without one never claims to be.
    faqMatchesPage: hasFaqOnPage === types.includes("FAQPage"),
    // Nothing user-specific may reach a crawlable surface.
    noInboxLeak: !/tm_inbox|recovery token=|mailbox=/i.test(html.slice(0, 200000)),
  };
  for (const [name, ok] of Object.entries(checks)) if (!ok) fail(path, name);
  pages.push({ path, status, title, canonical, h1Count, jsonLdBlocks: blocks.length, types: [...new Set(types)], checks, passed: Object.values(checks).every(Boolean) });
}

// -------------------------------------------------- never-index enforcement
const neverIndexed = [];
for (const path of NEVER_INDEX) {
  const r = await fetch(BASE + path, { redirect: "manual" });
  const tag = r.headers.get("x-robots-tag") || "";
  const body = r.status === 200 ? await r.text() : "";
  const safe = r.status !== 200
    ? true // a 404 cannot be indexed
    : /noindex/.test(tag) || /<meta name="robots" content="[^"]*noindex/.test(body);
  if (!safe) fail(path, "reachable with 200 and no noindex directive");
  neverIndexed.push({ path, status: r.status, xRobotsTag: tag || null, protected: safe });
}

const summary = {
  checkedAt: new Date().toISOString(),
  base: BASE,
  robots: { passed: robotsPassed, advertisesSitemap: /(^|\n)Sitemap: /i.test(robots.body) },
  sitemapIndex: { passed: indexPassed },
  sitemap: { urls: locs.length, passed: locs.length > 1 && !failures.some((f) => f.scope === "sitemap.xml") },
  neverIndexed,
  pages,
  failures,
  passed: failures.length === 0,
};
writeFileSync("docs/seo/verification.json", `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ base: BASE, urls: locs.length, failures: failures.length, passed: summary.passed, failures }, null, 2));
if (!summary.passed) process.exitCode = 1;
