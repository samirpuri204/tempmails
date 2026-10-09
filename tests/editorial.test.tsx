import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Body, safeContentHref } from "../components/content-body";
import { postSchema } from "../lib/post-schema";
import { sourcesFrom, jsonLd } from "../lib/editorial";
import { articles } from "../lib/content";
import { contentLinks } from "../lib/content-registry";
import { sitemapEntries, isReservedAppPath, PRIVATE_PATHS } from "../lib/seo-urls";
import { resolvePublication } from "../lib/editorial-publish";
import { pageSchema } from "../lib/page-schema";
import { JOURNAL_NAME, JOURNAL_TITLE, SITE_NAME } from "../lib/seo";
import { BRAND } from "../lib/brand";
import { journalImage } from "../lib/og-image";
import { readFile } from "node:fs/promises";
import nextConfig from "../next.config";

describe("editorial rendering and security", () => {
  it("renders headings, lists, emphasis, links and tables without raw HTML", () => {
    const html = renderToStaticMarkup(createElement(Body, { text: "## Heading\nBody paragraph\n\n### Detail\n\n- **One**\n- Two\n\n[Safe](/privacy) [Bad](javascript:evil) <script>alert(1)</script>\n\n| A | B |\n| --- | --- |\n| 1 | 2 |" }));
    expect(html).toContain("<h2>Heading</h2>"); expect(html).toContain("<h3>Detail</h3>"); expect(html).toContain("<ul>"); expect(html).toContain("<table>"); expect(html).toContain('href="/privacy"'); expect(html).not.toContain('href="javascript:'); expect(html).not.toContain("<script>"); expect(html).not.toContain("<h1>");
  });
  it("rejects unsafe and protocol-relative links", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "//evil.test", "/\\evil", "https://u:p@host.test", "https://host.test/\nx"]) expect(safeContentHref(url)).toBe(false);
    expect(safeContentHref("/privacy")).toBe(true);
  });
  it("escapes JSON-LD script closers and filters sources", () => {
    expect(jsonLd({ text: "</script>" })).not.toContain("<"); expect(sourcesFrom([{ title: "Bad", url: "javascript:x" }])).toEqual([]);
  });
  it("validates editor fields and rejects invalid dates", () => {
    const post = { slug: "hello", title: "Hello world", description: "A description", body: "A complete example body", published: false };
    expect(postSchema.parse(post).sources).toEqual([]);
    expect(postSchema.safeParse({ ...post, reviewedAt: "broken" }).success).toBe(false);
    expect(postSchema.safeParse({ ...post, sources: [{ title: "x", url: "http://unsafe.test" }] }).success).toBe(false);
  });
  it("includes journal and contact and excludes unpublished posts", () => {
    const entries = sitemapEntries("https://tempmails.live", [], [{ slug: "draft", published: false, updatedAt: new Date() }, { slug: "future", published: true, updatedAt: new Date(), publishedAt: new Date("2099-01-01") }]);
    expect(entries.some(e => e.url.endsWith("/blog"))).toBe(true); expect(entries.some(e => e.url.endsWith("/contact"))).toBe(true); expect(entries.some(e => /draft|future/.test(e.url))).toBe(false);
    for (const link of contentLinks) expect(link.path === "/blog" || articles[link.path.slice(1)]).toBeTruthy();
  });
  it("removes launch-template copy and receive-only contradictions", () => {
    expect(articles.privacy.body).not.toMatch(/before public launch/); expect(articles.terms.body).not.toMatch(/before public launch|receive-only/); expect(articles["temporary-email"].body).toContain("Sending");
  });
  it("never publishes a draft or invents publication dates", () => {
    const draft = resolvePublication({ publishedAt: null, reviewedAt: null }, null);
    expect(draft).toEqual({ published: false, publishedAt: null, reviewedAt: null });

    const published = new Date("2026-09-10T00:00:00.000Z"), reviewed = new Date("2026-09-11T00:00:00.000Z");
    expect(resolvePublication({ publishedAt: published, reviewedAt: reviewed }, null)).toEqual({ published: true, publishedAt: published, reviewedAt: reviewed });

    // An already-live row keeps its provenance and stays live; a sync may not
    // re-date it, and a manifest without a date may not un-publish it.
    const stored = { published: true, publishedAt: new Date("2026-01-01T00:00:00.000Z"), reviewedAt: new Date("2026-01-02T00:00:00.000Z") };
    expect(resolvePublication({ publishedAt: null, reviewedAt: null }, stored)).toEqual({ published: true, publishedAt: stored.publishedAt, reviewedAt: stored.reviewedAt });
  });
  it("describes visible FAQs on one entity per URL, and only when they exist", () => {
    const base = { slug: "temporary-email", title: "Temporary email", description: "d", updatedAt: new Date("2026-09-17T00:00:00.000Z"), siteName: SITE_NAME };
    const withFaqs = pageSchema({ ...base, faqs: [{ question: "Q", answer: "A" }] });
    expect(withFaqs["@type"]).toEqual(["Article", "FAQPage"]);
    expect(withFaqs.mainEntity).toEqual([{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "A" } }]);
    expect(withFaqs["@id"]).toBe("https://tempmails.live/temporary-email#page");
    expect(withFaqs.url).toBe(withFaqs.mainEntityOfPage);

    // A page with no visible questions must not claim any.
    const withoutFaqs = pageSchema({ ...base, faqs: [] });
    expect(withoutFaqs["@type"]).toBe("Article");
    expect(withoutFaqs).not.toHaveProperty("mainEntity");

    // About/Contact/legal pages are WebPage-family, never Article.
    expect(pageSchema({ ...base, slug: "privacy", faqs: [] })["@type"]).toBe("WebPage");
    expect(pageSchema({ ...base, slug: "about", faqs: [] })["@type"]).toBe("AboutPage");
    expect(pageSchema({ ...base, slug: "contact", faqs: [] })["@type"]).toBe("ContactPage");
  });

  it("reserves application paths so a content row can never expose them", () => {
    for (const path of PRIVATE_PATHS) {
      const slug = path.replace(/\//g, "");
      expect(isReservedAppPath(slug)).toBe(true);
      expect(isReservedAppPath(path)).toBe(true);
      expect(isReservedAppPath(`${slug}/child`)).toBe(true);
    }
    for (const slug of ["faq", "about", "temporary-email", "how-it-works", "inboxes"]) {
      expect(isReservedAppPath(slug)).toBe(false);
    }
  });

  it("sends noindex headers for every reserved segment, without blocking crawlers", async () => {
    const rules = await nextConfig.headers!();
    const reserved = rules.filter(r => r.source.includes(":reserved("));
    // Each reserved segment must be covered both bare and with subpaths.
    expect(reserved.map(r => r.source)).toEqual([
      "/:reserved(api|admin|inbox|auth|recover)",
      "/:reserved(api|admin|inbox|auth|recover)/:path*",
    ]);
    for (const rule of reserved) {
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
    // Robots assets must never be caught by a reserved rule.
    for (const rule of reserved) expect(rule.source).not.toMatch(/sitemap|robots/);

    // The three lists of reserved segments must be identical in membership:
    // the route guard, the header alternation, and the crawler check. A drift
    // here is how a segment ends up protected in one place and open in another.
    const fromHeader = reserved[0].source.replace("/:reserved(", "").replace(")", "").split("|").sort();
    const fromGuard = PRIVATE_PATHS.map(p => p.replace(/\//g, "")).sort();
    const fromCheck = [...(await readFile("scripts/seo-check.mjs", "utf8"))
      .match(/const NEVER_INDEX = \[(.*?)\]/s)![1].matchAll(/"\/([a-z]+)"/g)].map(m => m[1]).sort();
    expect(fromHeader).toEqual(fromGuard);
    expect(fromHeader).toEqual(fromCheck);
  });

  it("dates the journal hub from its newest entry and keeps the hub name aligned", async () => {
    const older = new Date("2026-08-01T00:00:00.000Z"), newer = new Date("2026-09-15T00:00:00.000Z");
    const entries = sitemapEntries("https://tempmails.live", [], [
      { slug: "a", published: true, updatedAt: older, publishedAt: older },
      { slug: "b", published: true, updatedAt: newer, publishedAt: newer },
    ]);
    const journal = entries.find(e => e.url === "https://tempmails.live/blog");
    expect(journal?.lastModified).toEqual(newer);
    expect(entries.find(e => e.url.endsWith("/blog/a"))?.lastModified).toEqual(older);
    // Guides with no stored row carry no invented date.
    expect(entries.find(e => e.url.endsWith("/faq"))?.lastModified).toBeUndefined();

    expect(JOURNAL_TITLE.startsWith(JOURNAL_NAME)).toBe(true);
    expect(JOURNAL_TITLE.length).toBeLessThanOrEqual(60);
    expect(journalImage).toBeTypeOf("function");
  });

  it("preserves the subpath when retiring legacy language-prefixed URLs", async () => {
    const rules = await nextConfig.redirects!();
    const deep = rules.find(r => r.source === "/:lang(en|ne)/:path*");
    expect(deep?.destination).toBe("/:path*");
    expect(deep?.permanent).toBe(true);
    const bare = rules.find(r => r.source === "/:lang(en|ne)");
    // A bare language root has no subpath to preserve; anything else would be
    // inventing a destination.
    expect(bare?.destination).toBe("/");
  });

  it("keeps manifest files, H1 titles and internal links aligned", async () => {
    const manifest = JSON.parse(await readFile("content/blog/manifest.json", "utf8")) as Array<{ slug: string; title: string; file: string }>;
    const slugs = new Set(manifest.map(m => m.slug));
    for (const m of manifest) {
      expect(m.file).toBe(`content/blog/${m.slug}.md`);
      const text = await readFile(m.file, "utf8");
      expect(text.split("\n")[0]).toBe(`# ${m.title}`);
      for (const [, href] of text.matchAll(/\]\((\/[a-z0-9/-]+)\)/g)) {
        const target = href.startsWith("/blog/") ? (slugs.has(href.slice(6)) ? "/blog" : href) : href;
        expect(target === "/blog" || !!articles[target.slice(1)], `${m.slug} links to missing ${href}`).toBe(true);
      }
    }
  });
});

describe("published operator identity", () => {
  // Every published word of copy, so the invariants below cannot be satisfied
  // by one page while another page drifts.
  const copy = Object.values(articles)
    .map(
      (a) =>
        `${a.title}\n${a.description}\n${a.body}\n${a.faqs
          .map((f) => `${f.question}\n${f.answer}`)
          .join("\n")}`,
    )
    .join("\n");

  it("states the operator, the country and the business mailbox", () => {
    expect(copy).toContain(BRAND.founder);
    expect(copy).toContain(BRAND.country);
    expect(copy).toContain(BRAND.email);
  });

  it("uses exactly one operator name across every page", () => {
    // Generic on purpose: a superseded spelling is caught without the stale name
    // being written into the repository, and a future rename cannot half-apply.
    const names = [...copy.matchAll(/\bSamir\s+[A-Z][a-z]+/g)].map((m) => m[0]);
    expect(names.length).toBeGreaterThan(0);
    expect([...new Set(names)]).toEqual([BRAND.founder]);
  });

  it("publishes no address other than the business mailbox", () => {
    // `:` is excluded from the local part so a `mailto:` prefix cannot turn one
    // address into two different-looking ones.
    const addresses = [...copy.matchAll(/[^\s@()<>[\]:]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map(
      (m) => m[0],
    );
    expect([...new Set(addresses)]).toEqual([BRAND.email]);
  });
});
