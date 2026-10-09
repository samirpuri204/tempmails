"use client";

import { useEffect } from "react";
import { adsterraSocialBar, socialBarActive } from "@/lib/ad-config";

/**
 * The Adsterra Social Bar — the notification-style unit — mounted exactly once
 * for the whole site.
 *
 * This is the second unit from the same Adsterra account as the banner, but it
 * is not the same shape. The banner needs an `atOptions` block ahead of its
 * loader, so that component inserts two scripts in a fixed order. This unit's
 * entire publisher snippet is one plain script tag, which is what is inserted
 * here. See `adsterraSocialBar` in lib/ad-config for why the URL is recorded
 * verbatim rather than reassembled from a host and key.
 *
 * Adsterra's own instruction is to place it immediately above the closing
 * </body> tag, which is where the root layout mounts it, so it loads on every
 * public page. It is skipped entirely on /admin — the console is not a public
 * page and must never carry ad code, the same rule the banner and the Monetag
 * tag both follow.
 *
 * Insertion happens once per document, and "is it already there?" is asked of
 * the document rather than tracked in a module-level flag: a flag would be
 * wrong in whichever direction the document happened to disagree with it after
 * a navigation replaced the page's scripts. A tag that fails stays in the
 * document, so the same check still finds it and it is never re-requested —
 * there is no retry, no backoff and no polling loop, so an ad blocker cannot
 * turn into repeated network attempts.
 *
 * There is no unmount cleanup, unlike the banner. That component is placed per
 * page and can be navigated away from while the document survives; this one
 * lives in the root layout, where unmounting means the document is being torn
 * down, so removing the tag on the way out would only force a re-request if the
 * layout ever remounted.
 *
 * Fail soft, like every other ad path: a loader error is swallowed. Ads are the
 * least important thing on a page that also has to deliver temporary email.
 */
export default function SocialBarTag({ nonce }: { nonce?: string }) {
  useEffect(() => {
    if (!socialBarActive()) return;
    if (window.location.pathname.startsWith("/admin")) return;
    // A visitor paying per megabyte is not a visitor to spend an overlay on.
    const dataSaver =
      ((navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData) ?? false;
    if (dataSaver) return;

    const src = adsterraSocialBar.src;
    // Compared against the parsed `src` of every script rather than matched with
    // a CSS selector, so the check does not depend on the attribute text being
    // byte-identical to the string above.
    if ([...document.scripts].some((script) => script.src === src)) return;

    const tag = document.createElement("script");
    tag.src = src;
    tag.async = true;
    // `nonce` is only ever absent outside a request, so the guard keeps a
    // literal "undefined" out of the attribute.
    if (nonce) tag.nonce = nonce;
    tag.onerror = () => {
      // Blocked or unavailable: an ad blocker, a filtering resolver, a VPN or
      // datacenter address the network declines, or a policy rejection. Stay
      // silent — an ad failure must never reach the inbox.
    };

    (document.body ?? document.documentElement).appendChild(tag);
  }, [nonce]);

  return null;
}
