"use client";

import Script from "next/script";
import { adsenseActive } from "@/lib/ad-config";
import { ADSENSE_SRC } from "../adsense-slot";

/**
 * Google AdSense Auto ads.
 *
 * Auto ads is the variant of AdSense that uses no container positions: the
 * dashboard decides where ads go and drives them through this one script, so
 * there is nothing for the site to place and no `data-ad-slot` to configure.
 * That is why this renders a bare loader with no `<ins>` element, and why it is
 * mounted once for the whole site rather than repeated per position.
 *
 * The five manual positions in `AdPlacement` stay wired and render nothing
 * while their slots are unset, so they cannot collide with this. If a slot is
 * ever pasted into /admin the two paths coexist: this loader and the one inside
 * `AdsenseSlot` share the script id below, so the document ends up with one
 * recognisable adsbygoogle tag rather than two independently added ones.
 *
 * No nonce is passed. The root layout cannot read one without turning itself
 * into a dynamic render, and it is not needed: the CSP carries
 * 'strict-dynamic', so a script inserted by the already-trusted Next runtime is
 * allowed whatever its host. That is the same reason MonetagTag, mounted in the
 * same layout, loads without one.
 *
 * `afterInteractive` matches the existing AdSense slot. Google's snippet is a
 * plain <head> tag; under Next the strategy, not the JSX position, decides when
 * the script actually runs.
 */
export default function AutoAds() {
  if (!adsenseActive()) return null;

  return (
    <Script
      id="google-adsense"
      strategy="afterInteractive"
      async
      crossOrigin="anonymous"
      src={ADSENSE_SRC}
    />
  );
}
