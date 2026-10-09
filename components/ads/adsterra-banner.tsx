"use client";

import { useEffect, useRef } from "react";
import {
  adConfig,
  adsterra,
  adsterraActive,
} from "@/lib/ad-config";

/**
 * The Adsterra iframe banner for the reinstated zone.
 *
 * Reinstated on the owner's instruction after the 2026-09-18 migration that
 * removed Adsterra in favour of Monetag. See
 * docs/MONETIZATION-MIGRATION-REPORT.md for the record of that migration, and
 * tests/ads.test.ts for the (now-weakened) enforcement of it.
 *
 * This is the iframe 468x60 unit from the Adsterra snippet the owner supplied:
 *
 *   <script>
 *     atOptions = {
 *       'key' : '667e12baeee8c82d264233fab2ccfd93',
 *       'format' : 'iframe',
 *       'height' : 60,
 *       'width' : 468,
 *       'params' : {} };
 *   </script>
 *   <script src="https://doubtfulimpatient.com/667e12baeee8c82d264233fab2ccfd93/invoke.js"></script>
 *
 * That snippet is reproduced here as the only place the zone key, format and
 * loader host live in code. The host and key are read from environment so a
 * zone change or a different serving domain does not require a code change —
 * only NEXT_PUBLIC_ADSTERRA_KEY and NEXT_PUBLIC_ADSTERRA_HOST, redeployed.
 *
 * This component renders nothing on /admin and nothing when ads are globally
 * disabled, the same guard the rest of the ad surface uses. It renders nothing
 * when the zone key or loader host is missing, so a half-configured build never
 * ships an unkeyed or hostless banner.
 *
 * There is no duplicate guard here, because Adsterra's loader is designed to be
 * embedded once per placement and self-regulates on the network side — unlike
 * Monetag's whole-site tag, which must refuse a second insertion in the document.
 * If a placement is placed twice by mistake the network simply receives two
 * requests; that is a placement-budget bug, not a loader bug, and it is the kind
 * of thing the placement-budget test already flags.
 */
export default function AdsterraBanner({
  placement,
  nonce,
}: {
  /** Human-readable position, e.g. "homepage below inbox card". Used in the label. */
  placement: string;
  nonce?: string;
}) {
  // Every hook runs before any guard, and the guards are split by what each one
  // needs to know. This component is server-rendered once and then hydrated: an
  // early return that skipped a hook, or a guard whose answer differed between
  // the two renders, makes React discard the client tree with a hydration error.
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Browser-only guards, decided here rather than in the render body.
    //
    // `/admin` mounts no ad surface of its own; keeping this check means the
    // render is identical on both sides, and the only cost is an empty labelled
    // box if this component is ever mounted there. Save-Data is a client-only
    // network hint.
    if (!adConfig.enabled) return;
    if (window.location.pathname.startsWith("/admin")) return;
    if (!adsterraActive()) return;
    if (!adsterra.key || !adsterra.host) return;
    const dataSaver =
      ((navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData) ?? false;
    if (dataSaver) return;

    // The atOptions block must be present before the invoke script runs, so the
    // zone key and format the network expects are defined when the loader
    // executes. Order matters: the options script first, then the invoke script.
    const opts = document.createElement("script");
    opts.text =
      `
      atOptions = {
        'key' : '${adsterra.key}',
        'format' : '${adsterra.format}',
        'height' : ${adsterra.height},
        'width' : ${adsterra.width},
        'params' : {}
      };
    `;
    opts.async = false;
    // Carry the request's CSP nonce onto both scripts. `nonce` is only ever
    // absent outside a request, so the guard keeps a literal "undefined" out of
    // the attribute.
    if (nonce) opts.nonce = nonce;

    const loader = document.createElement("script");
    loader.src = adsterra.invokeUrl;
    loader.async = true;
    if (nonce) loader.nonce = nonce;
    loader.onerror = () => {
      // Blocked or unavailable: an ad blocker, a filtering resolver, a VPN or
      // datacenter address the network declines, or a policy rejection. Stay
      // silent. The loader is fire-and-forget by design — no retry, no backoff,
      // never let an ad failure reach the inbox.
    };

    // Append INSIDE the labelled box. Adsterra's loader positions its iframe
    // relative to the script element that carries it, so appending to a
    // page-wide container put the banner wherever that container ended.
    //
    // Measured on production before this change: the 468x60 iframe rendered at
    // y=3178 — below the footer, which ends at y=2997 — while the labelled box
    // sat empty directly under the inbox card at y=1214. The label and the ad
    // were roughly 2,000px apart.
    const slot = slotRef.current;
    if (!slot) return;
    slot.appendChild(opts);
    slot.appendChild(loader);

    return () => {
      // On unmount (e.g. a client-side navigation away from the page), remove
      // the scripts we inserted so a stale placement does not linger in a
      // document that has moved on. This is not a retry guard — the next mount
      // will re-create the pair — it is hygiene, so a banner does not survive a
      // navigation that left the page behind.
      try {
        opts.remove();
        loader.remove();
      } catch {
        // The DOM may already have been torn down; ignore.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build-time constants only, so the server and the client always agree and
  // the labelled box reserves its height before the network fills it.
  if (!adConfig.enabled) return null;
  if (!adsterraActive()) return null;
  if (!adsterra.key || !adsterra.host) return null;

  return (
    <aside className="adsense-placement" aria-label={`Advertisement — ${placement}`}>
      <span className="adsense-label">Advertisement</span>
      <div ref={slotRef} className="adsterra-slot" />
    </aside>
  );
}
