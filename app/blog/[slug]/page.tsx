import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPost } from "@/lib/content-data";
import { settings, defaults } from "@/lib/settings";
import { displayDate, sourcesFrom } from "@/lib/editorial";
import Link from "next/link";
import ContentShell, { Body } from "@/components/content-shell";
import AdPlacement from "@/components/ads/placement";
import { siteUrl } from "@/lib/site-url";
import { SITE_NAME, breadcrumbSchema } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await getPost(slug);
  let s = defaults;
  try { s = await settings(); } catch {}
  return {
    title: p?.metaTitle ? { absolute: p.metaTitle } : p?.title || "Not found",
    description: p?.description,
    alternates: { canonical: `/blog/${slug}` },
    robots: { index: !!p && s.indexPublicPages, follow: !!p },
    openGraph: {
      type: "article",
      publishedTime: p?.publishedAt?.toISOString(),
      modifiedTime: p?.updatedAt.toISOString(),
      url: siteUrl(`/blog/${slug}`),
      siteName: SITE_NAME,
      title: p?.title,
      description: p?.description,
    },
  };
}
export default async function Post({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p?.published) notFound();
  const nonce = (await headers()).get("x-nonce") || undefined;
  let s = defaults;
  try { s = await settings(); } catch {}
  const sources = sourcesFrom(p.sources);
  const crumbs = [{ name: "Home", path: "/" }, { name: "Journal", path: "/blog" }, { name: p.title, path: `/blog/${slug}` }];
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: (p.publishedAt ?? p.createdAt).toISOString(),
    dateModified: p.updatedAt.toISOString(),
    author: { "@type": p.author === SITE_NAME ? "Organization" : "Person", name: p.author, ...(p.author === SITE_NAME ? { url: siteUrl("/about") } : {}) },
    articleSection: p.category,
    inLanguage: "en",
    image: siteUrl(`/blog/${slug}/opengraph-image`),
    citation: sources.map(source => source.url),
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: siteUrl(`/blog/${slug}`),
  };
  // Ad budget for a long article: one unit after the opening paragraph, one at
  // the midpoint, one near the end, each separated by real content rather than
  // stacked. The first two are injected into the body relative to its own
  // structure (see BodyAd), so they keep their intended position as the copy is
  // edited and never land in the opening sentence. `adTop={null}` suppresses the
  // shell's default unit at the top, because this page's first unit belongs
  // after the intro rather than between the title and the first paragraph.
  //
  // Each position uses the AdSense slot configured for it in /admin and renders
  // nothing while that slot is empty.
  const bodyAds = [
    { at: "intro" as const, key: "post-intro", node: <AdPlacement placement="journal after introduction" nonce={nonce} adsenseSlot={s.adsenseArticleTopSlot} adsenseEnabled={s.adsenseEnabled} /> },
    { at: "middle" as const, key: "post-mid", node: <AdPlacement placement="journal mid-article" nonce={nonce} adsenseSlot={s.adsenseContentSlot} adsenseEnabled={s.adsenseEnabled} /> },
  ];
  return (
    <ContentShell
      title={p.title}
      crumbs={crumbs}
      adTop={null}
      adBottom={<AdPlacement placement="journal end of article" nonce={nonce} adsenseSlot={s.adsenseContentSlot} adsenseEnabled={s.adsenseEnabled} />}
    >
      <p>{p.description}</p>
      <p className="editorial-meta">{p.category} · By {p.author === SITE_NAME ? <Link href="/about">{p.author}</Link> : p.author}<br />Published <time dateTime={(p.publishedAt ?? p.createdAt).toISOString()}>{displayDate(p.publishedAt ?? p.createdAt)}</time> · Updated <time dateTime={p.updatedAt.toISOString()}>{displayDate(p.updatedAt)}</time>{p.reviewedAt && <> · Source-checked <time dateTime={p.reviewedAt.toISOString()}>{displayDate(p.reviewedAt)}</time></>}</p>
      <Body text={p.body} ads={bodyAds} />
      {sources.length > 0 && <section aria-label="Article sources"><h2>Sources</h2><ul>{sources.map(source => <li key={source.url}><a href={source.url} rel="noopener noreferrer">{source.title}</a></li>)}</ul></section>}
      <p>Found an error? <Link href="/contact">Send a correction</Link>. Read <Link href="/about">how our content is prepared</Link>.</p>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(article).replace(/</g, "\\u003c"),
        }}
      />
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Journal", path: "/blog" },
              { name: p.title, path: `/blog/${slug}` },
            ]),
          ).replace(/</g, "\\u003c"),
        }}
      />
    </ContentShell>
  );
}
