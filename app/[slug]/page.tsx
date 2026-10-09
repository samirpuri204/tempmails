import { getPage as get } from "@/lib/content-data";
import { displayDate, jsonLd } from "@/lib/editorial";
import { webPageSlugs } from "@/lib/content-registry";
import { isReservedAppPath } from "@/lib/seo-urls";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { settings, defaults } from "@/lib/settings";
import ContentShell, { Body } from "@/components/content-shell";
import CompanyInfo from "@/components/company-info";
import ContactForm from "@/components/contact-form";
import { siteUrl } from "@/lib/site-url";
import { BRAND } from "@/lib/brand";
import { companyGraph } from "@/lib/company-schema";
import { SITE_NAME, breadcrumbSchema, pageTitle, absoluteAsset } from "@/lib/seo";
import { pageSchema } from "@/lib/page-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Reserved application paths must never advertise themselves as indexable,
  // even if a stored content row happens to share the slug.
  const p = isReservedAppPath(slug) ? null : await get(slug);
  let s = defaults;
  try {
    s = await settings();
  } catch {}
  return {
    title: p ? pageTitle(p.title) : "Not found",
    description: p?.description,
    alternates: { canonical: `/${slug}` },
    robots: { index: !!p && s.indexPublicPages, follow: !!p },
    openGraph: {
      // Next.js replaces a parent's `openGraph` object wholesale instead of
      // merging it, so every field the layout sets has to be restated here or
      // it silently disappears from the rendered page.
      type: "website",
      url: siteUrl(`/${slug}`),
      siteName: s.name || SITE_NAME,
      title: p?.title,
      description: p?.description,
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let r = null;
  try {
    r = await db.redirect.findUnique({ where: { source: `/${slug}` } });
  } catch {}
  if (r) {
    if (r.permanent) permanentRedirect(r.destination);
    redirect(r.destination);
  }
  // `/[slug]` is a catch-all route, so a stored content row could otherwise
  // make a reserved application path (/inbox, /auth, /recover, /admin, /api)
  // renderable and indexable. Refuse before any content is read.
  if (isReservedAppPath(slug)) notFound();
  const p = await get(slug);
  if (!p) notFound();
  const nonce = (await headers()).get("x-nonce") || undefined;
  let s = defaults;
  try { s = await settings(); } catch {}
  const isArticle = !webPageSlugs.has(slug);
  const schema = pageSchema({
    slug,
    title: p.title,
    description: p.description,
    updatedAt: p.updatedAt,
    faqs: p.faqs,
    siteName: s.name,
  });
  // Mirrors the visible "Home / <title>" breadcrumb so Google can show a
  // readable trail in place of the raw URL.
  const breadcrumb = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: p.title, path: `/${slug}` },
  ]);
  return (
    <ContentShell title={p.title}>
      <p>{p.description}</p>
      <p className="editorial-meta">{isArticle && <>By <Link href="/about">{s.name}</Link> · </>}Last updated <time dateTime={p.updatedAt.toISOString()}>{displayDate(p.updatedAt)}</time></p>
      {["temporary-email", "how-it-works", "faq", "terms", "privacy"].includes(slug) && <aside className="service-facts" aria-label="Current service settings">
        <h2>Current service settings</h2>
        <p>New inbox duration: {s.retentionMinutes} minutes. Maximum lifetime with available extensions: {s.maxLifetimeMinutes} minutes. Your inbox countdown remains authoritative. Attachments: {s.attachments ? "enabled subject to scanning and limits" : "disabled"}.</p>
        <p>{s.sendingEnabled ? `Sending is enabled: plain-text input, up to ${s.sendMaxChars.toLocaleString("en")} characters and ${s.sendLimitPerInbox} sends per inbox per hour, subject to security checks, provider availability, daily limits, and blocklists. Every message carries a TempMails footer; replies use the temporary address and require an active inbox.` : "Sending is currently disabled."}</p>
      </aside>}
      <Body text={p.body} />
      {/* Company identity is rendered from lib/brand.ts rather than retyped in
          the copy, so the two pages that describe the operator cannot disagree
          with each other, with the footer, or with the structured data. */}
      {(slug === "about" || slug === "company") && (
        <CompanyInfo variant={slug === "about" ? "compact" : "full"} />
      )}
      {slug === "contact" && (
        <section className="contact-channels" aria-labelledby="contact-operator">
          <h2 id="contact-operator">Operator contact</h2>
          <p>
            One mailbox reaches the person who runs {s.name}. Write in, and the
            message is read by the operator — there is no ticket queue and no
            automated reply.
          </p>
          <p className="contact-address">
            <a href={`mailto:${s.contactEmail || BRAND.email}`}>
              {s.contactEmail || BRAND.email}
            </a>
          </p>
          <ContactForm />
        </section>
      )}
      <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      {(slug === "about" || slug === "company") && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(
              companyGraph({
                name: s.name || SITE_NAME,
                logoUrl: absoluteAsset(s.logo) || undefined,
                sameAs: s.socialLinks.map((l) => l.url),
              }),
            ),
          }}
        />
      )}
      <Link className="primary" href="/">
        Open your temporary inbox
      </Link>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c"),
        }}
      />
      {p.faqs.length > 0 && (
        <section>
          <h2>Common questions</h2>
          {p.faqs.map((f) => (
            <details key={f.question}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </section>
      )}
    </ContentShell>
  );
}
