import { headers } from "next/headers";
import Link from "next/link";
import { Mail, ArrowRight } from "lucide-react";
import { settings, defaults } from "@/lib/settings";
import { contentLinks } from "@/lib/content-registry";
import AdPlacement from "./ads/placement";
import type { Crumb } from "@/lib/seo";
export { Body } from "./content-body";

/**
 * Shell for every editorial page.
 *
 * Adverts are passed in rather than decided here, so each page's ad budget is
 * visible in one place. Pages that pass neither `adTop` nor `adBottom` get the
 * standard guide pair — one unit under the title and one after the body, which
 * is the 1–2 placements a static informational page is allowed. A page that
 * places its own units passes `null` for the side it does not want, which
 * suppresses the default instead of stacking another unit on top of it.
 *
 * These are AdSense positions: the Monetag tag is site-wide and places itself,
 * so it is not something a page decides about.
 */
export default async function ContentShell({
  title,
  children,
  crumbs,
  adTop,
  adBottom,
}: {
  title: string;
  children: React.ReactNode;
  crumbs?: Crumb[];
  adTop?: React.ReactNode;
  adBottom?: React.ReactNode;
}) {
  let site = defaults;
  try {
    site = await settings();
  } catch {}
  const nonce = (await headers()).get("x-nonce") || undefined;
  // `undefined` means "not specified"; `null` means "I am placing this myself".
  const placesOwnAds = adTop !== undefined || adBottom !== undefined;
  const top =
    adTop !== undefined
      ? adTop
      : placesOwnAds
        ? null
        : (
            <AdPlacement
              placement="article top"
              nonce={nonce}
              adsenseSlot={site.adsenseArticleTopSlot}
              adsenseEnabled={site.adsenseEnabled}
            />
          );
  const bottom =
    adBottom !== undefined
      ? adBottom
      : placesOwnAds
        ? null
        : (
            <AdPlacement
              placement="article footer"
              nonce={nonce}
              adsenseSlot={site.adsenseContentSlot}
              adsenseEnabled={site.adsenseEnabled}
            />
          );
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Mail size={23} />
          </span>
          {site.name}.
        </Link>
        <nav>
          <Link href="/">
            Open inbox <ArrowRight size={14} />
          </Link>
          {/* Who runs this is one click from every content page, not only from
              the footer: a reader deciding whether to trust the service should
              not have to scroll past a policy to find the operator. */}
          <Link href="/about">About</Link>
          <Link href="/company">Company</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/blog">Journal</Link>
          <Link href="/faq">FAQs</Link>
        </nav>
      </header>
      <main className="content-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {(crumbs ?? [{ name: "Home", path: "/" }, { name: title, path: "" }]).map((crumb, i, all) => (
            <span key={i}>{i > 0 && " / "}{i === all.length - 1 ? <span aria-current="page">{crumb.name}</span> : <Link href={crumb.path}>{crumb.name}</Link>}</span>
          ))}
        </nav>
        <h1>{title}</h1>
        {top}
        {children}
        {bottom}
        <nav className="related" aria-label="Related resources">
          {contentLinks.map(link => <Link key={link.path} href={link.path}>{link.label}</Link>)}
        </nav>
      </main>
    </>
  );
}
