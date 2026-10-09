import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import ContentShell from "@/components/content-shell";
import AdPlacement from "@/components/ads/placement";
import { siteUrl } from "@/lib/site-url";
import { SITE_NAME, JOURNAL_NAME, JOURNAL_TITLE, breadcrumbSchema } from "@/lib/seo";
import { displayDate, jsonLd } from "@/lib/editorial";
import { publicIndexSettings } from "@/lib/seo-urls";
import { settings, defaults } from "@/lib/settings";

// One description for the meta tag, the Open Graph tag and the social card,
// so the hub cannot be described two different ways.
const journalDescription =
  "Source-checked guides to email privacy, changing provider features, and safer short-term communication from TempMails.";

export async function generateMetadata() {
  const { index } = await publicIndexSettings();
  return {
    // Absolute, because the title already contains the brand: the root
    // template would otherwise render "The TempMails Journal | TempMails".
    title: { absolute: JOURNAL_TITLE },
    description: journalDescription,
    alternates: { canonical: "/blog" },
    robots: { index, follow: true },
    openGraph: {
      type: "website",
      url: siteUrl("/blog"),
      siteName: SITE_NAME,
      title: JOURNAL_NAME,
      description: journalDescription,
    },
  };
}
export const dynamic = "force-dynamic";
const categoryId = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
type PostCard = {
  slug: string;
  title: string;
  description: string;
  category: string;
  author: string;
  publishedAt: Date | null;
  createdAt: Date;
  trending: boolean;
};
export default async function Blog() {
  const nonce = (await headers()).get("x-nonce") || undefined;
  let site = defaults;
  try { site = await settings(); } catch {}
  let posts: PostCard[] = [];
  try {
    posts = await db.blogPost.findMany({
      where: { published: true, OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] },
      select: { slug: true, title: true, description: true, category: true, author: true, publishedAt: true, createdAt: true, trending: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  } catch {
    // Empty state instead of a 500 while the editorial migration is pending or
    // the database is unreachable. /blog must stay crawlable and indexable.
  }
  const categories = [...new Set(posts.map(p => p.category))];
  const trending = posts.filter(p => p.trending);
  const crumbs = [{ name: "Home", path: "/" }, { name: "Journal", path: "/blog" }];
  // A listing page carries one unit only. `adTop={null}` suppresses the shell's
  // default unit so the hub never shows two before the reader has reached a
  // single article. The slot comes from /admin and empty means nothing renders.
  return <ContentShell
    title={JOURNAL_NAME}
    crumbs={crumbs}
    adTop={null}
    adBottom={<AdPlacement placement="journal hub" nonce={nonce} adsenseSlot={site.adsenseContentSlot} adsenseEnabled={site.adsenseEnabled} />}
  >
    <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(crumbs)) }} />
    <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@type": "CollectionPage", name: JOURNAL_NAME, description: journalDescription, url: siteUrl("/blog"), isPartOf: { "@type": "WebSite", name: SITE_NAME, url: siteUrl("/") }, inLanguage: "en" }) }} />
    <p>{journalDescription} <Link href="/about">Our editorial approach</Link>.</p>
    {categories.length > 0 && <nav className="category-nav" aria-label="Journal categories">{categories.map(c => <a key={c} href={`#${categoryId(c)}`}>{c}</a>)}</nav>}
    {trending.length > 0 && <section className="trending-section"><h2>Trending: editorial picks</h2><p>Recent topics selected for relevance, not a traffic or popularity ranking. Check the source dates before acting.</p><ul>{trending.map(p => <li key={p.slug}><Link href={`/blog/${p.slug}`}>{p.title}</Link></li>)}</ul></section>}
    {categories.map(category => <section id={categoryId(category)} key={category}><h2>{category}</h2>{posts.filter(p => p.category === category).map(p => <article className="journal-card" key={p.slug}><h3><Link href={`/blog/${p.slug}`}>{p.title}</Link></h3><p className="editorial-meta">By {p.author} · <time dateTime={(p.publishedAt ?? p.createdAt).toISOString()}>{displayDate(p.publishedAt ?? p.createdAt)}</time></p><p>{p.description}</p></article>)}</section>)}
    {!posts.length && <p>No articles have been published yet. Explore our <Link href="/how-it-works">guide to temporary inboxes</Link>.</p>}
  </ContentShell>;
}
