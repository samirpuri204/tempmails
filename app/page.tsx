import { headers } from "next/headers";
import { cache } from "react";
import HomeSeo from "@/components/home-seo";
import HomeIdentity from "@/components/home-identity";
import Inbox from "@/components/inbox";
import { settings, defaults } from "@/lib/settings";
import { siteOrigin } from "@/lib/site-url";
import { organizationSchema, founderSchema } from "@/lib/company-schema";
import {
  SITE_NAME,
  SITE_ALTERNATE_NAMES,
  absoluteAsset,
  siteNavigationSchema,
} from "@/lib/seo";

const get = cache(async () => {
  try {
    return await settings();
  } catch {
    return defaults;
  }
});
export async function generateMetadata() {
  const s = await get();
  return {
    title: { absolute: s.seoTitle },
    description: s.seoDescription,
    alternates: { canonical: "/" },
    verification: { google: s.searchConsole || undefined },
    icons: s.favicon ? { icon: s.favicon } : undefined,
    robots: { index: s.indexPublicPages, follow: true },
    openGraph: {
      // Next.js replaces a parent's `openGraph` object wholesale instead of
      // merging it, so `type` has to be restated here or the rendered page
      // carries every Open Graph tag except the one that says what it is.
      type: "website",
      url: siteOrigin(),
      siteName: s.name || SITE_NAME,
      title: s.seoTitle,
      description: s.seoDescription,
      ...(s.ogImage ? { images: [s.ogImage] } : {}),
    },
  };
}
export default async function Home() {
  const s = await get();
  const nonce = (await headers()).get("x-nonce") || undefined;
  const logoUrl = absoluteAsset(s.logo);
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      // The operating organisation and its founder come from the shared brand
      // record, so the homepage, /about and /company describe one business with
      // one @id instead of three look-alike nodes that can drift apart.
      organizationSchema({
        name: s.name,
        logoUrl,
        sameAs: s.socialLinks.map((l) => l.url),
      }),
      founderSchema(),
      {
        "@type": "WebSite",
        "@id": `${siteOrigin()}/#website`,
        name: s.name,
        // Alternate spellings of the brand. The bare domain is deliberately
        // absent: naming the domain here is what made search engines render
        // "tempmails.live" as the site name instead of the brand.
        alternateName: SITE_ALTERNATE_NAMES,
        url: siteOrigin(),
        publisher: { "@id": `${siteOrigin()}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteOrigin()}/#app`,
        name: s.name,
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Web",
        url: siteOrigin(),
        publisher: { "@id": `${siteOrigin()}/#organization` },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      // Names the pages that describe the operator and the product as a
      // navigation list, so a crawler does not have to infer that /company,
      // /ai-roadmap and the rest are primary pages rather than incidental ones.
      siteNavigationSchema(s.name || SITE_NAME),
    ],
  };
  return (
    <>
      <Inbox
        name={s.name}
        headline={s.homepageText}
        announcement={s.announcement}
        initialTheme={s.defaultTheme}
        nonce={nonce}
        logo={s.logo}
        languages={s.languages}
        socialLinks={s.socialLinks}
        ads={s.ads}
        adsenseEnabled={s.adsenseEnabled}
        adsenseTopSlot={s.adsenseTopSlot}
        adsenseMidSlot={s.adsenseMidSlot}
        adsenseBottomSlot={s.adsenseBottomSlot}
      >
        <HomeSeo retentionMinutes={s.retentionMinutes} />
      </Inbox>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      {/* Owner-controlled scripts are limited to the public homepage and opt-in. Never inject into API, admin, recovery, or message HTML. */}
      {s.scriptsEnabled && s.customScript && (
        <iframe
          title="Optional site widget"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="custom-widget"
          srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none';"><script>${s.customScript.replace(/<\/script/gi, "<\\/script")}</script>`}
        />
      )}
      {/* Who runs this, and where each claim can be checked. Rendered on the
          page every visitor lands on, with real anchors in the server HTML so
          the company, roadmap and repository are reachable by a crawler as well
          as by a reader. */}
      <HomeIdentity contactEmail={s.contactEmail} />
      {(s.footerLinks.length > 0 || s.socialLinks.length > 0) && (
        <aside className="content-page homepage-contact">
          {s.footerLinks.map((l) => (
            <p key={l.url}>
              <a href={l.url} rel="noopener noreferrer">
                {l.label}
              </a>
            </p>
          ))}
        </aside>
      )}
    </>
  );
}
