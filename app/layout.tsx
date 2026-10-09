import type { Metadata } from "next";
import { Fragment } from "react";
import "./globals.css";
import { siteOrigin, siteUrl } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/seo";
import { adConfig, adOrigins } from "@/lib/ad-config";
import MonetagTag from "@/components/ads/monetag-tag";
import AdsterraBanner from "@/components/ads/adsterra-banner";
import SocialBarTag from "@/components/ads/social-bar";
import AutoAds from "@/components/ads/auto-ads";

// Canonical origin, shared with every page so no metadata can resolve to a
// www / http / preview hostname.
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "Temp Mail — Free Temporary Email Inbox | TempMails",
    template: "%s | TempMails",
  },
  description:
    "A private temporary email inbox without registration. Receive short-term messages and keep your everyday inbox clean.",
  openGraph: {
    type: "website",
    url: siteUrl("/"),
    siteName: SITE_NAME,
    title: "Temp Mail — Free Temporary Email Inbox | TempMails",
    description:
      "A private temporary email inbox without registration. Receive short-term messages and keep your everyday inbox clean.",
  },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google-adsense-account" content="ca-pub-3624892885273135" />
        {/* Ad hosts are served from more than one origin now (Monetag plus the
            reinstated Adsterra banner's loader host). Warm every one the build
            would actually request, so DNS and TLS are done before the first ad
            request rather than during it — but only when ads are enabled at all,
            so an ads-off build ships no ad hostname. */}
        {adConfig.enabled &&
          adOrigins.map((origin) => (
            <Fragment key={origin}>
              <link rel="preconnect" href={origin} crossOrigin="anonymous" />
              <link rel="dns-prefetch" href={origin} />
            </Fragment>
          ))}
        {/* Google AdSense Auto ads: one site-wide loader, so it sits with the
            other head tags rather than with the position-based units in the
            body. Unlike the Adsterra and Monetag tags it has no container and no
            slot id — the AdSense dashboard decides placement, which is why
            nothing else in the tree refers to it. It is gated on
            `adsenseActive()`, so a build whose provider is `monetag` ships no
            AdSense script at all. */}
        <AutoAds />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div id="main-content">{children}</div>
        {/* The Adsterra banner, mounted once for the whole site so an article or
            guide reached directly carries the same unit the homepage does. It
            deliberately sits outside #main-content: it is not page content, and
            the skip link should not land a screen reader on an advert.
            
            Each page renders its own footer *inside* #main-content, and only the
            homepage has one — so "above the footer" is not expressible site-wide.
            This sits at the end of the document instead: below the homepage's
            footer, and after the last content block on every other page.
            
            The homepage therefore carries two Adsterra units — this one and the
            one under the inbox card — which is the placement budget the owner
            asked for. Adsterra's loader has no duplicate guard by design, so two
            placements mean two requests; that is intended, not a leak. */}
        <AdsterraBanner placement="site-wide, end of document" />
        {/* The Monetag tag is a whole-site unit, so it is mounted exactly once
            here rather than per page. It renders nothing into the tree, and the
            loader refuses a second copy — which is what keeps a single instance
            across client-side navigation and remounts. AdSense positions are
            placed per page and are never rendered inside it. */}
        <MonetagTag />
        {/* The Adsterra Social Bar, last in the document because that is the
            placement its publisher code specifies: "insert it right above the
            closing </body> tag". A second unit on the same account as the banner
            above, and a notification-style one, but a different snippet shape —
            see components/ads/social-bar.tsx. */}
        <SocialBarTag />
      </body>
    </html>
  );
}
