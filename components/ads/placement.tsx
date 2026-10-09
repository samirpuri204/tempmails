import AdsenseSlot from "../adsense-slot";
import { adsenseActive } from "@/lib/ad-config";

/**
 * One named in-content ad position, filled by whichever network can fill it.
 *
 * Only AdSense can occupy a position. Monetag is tag-based: its zone decides
 * which formats run and the unit places itself, so it never fills a container
 * of ours and cannot be handed a position — the tag is mounted once for the
 * whole site in the root layout. That split is why a placement is AdSense-only
 * and why two networks can never stack on the same spot.
 *
 * Returns null when nothing is configured, so a placement never leaves an empty
 * labelled box behind — which today is the common case, because the site's
 * AdSense slot ids are still empty. Positions come alive as soon as an id is
 * pasted into /admin.
 */
export default function AdPlacement({
  placement,
  nonce,
  adsenseSlot = "",
  adsenseEnabled = false,
}: {
  /** Human-readable position, e.g. "homepage primary". Used in the label. */
  placement: string;
  nonce?: string;
  /** AdSense: the data-ad-slot for this position. Empty renders nothing. */
  adsenseSlot?: string;
  adsenseEnabled?: boolean;
}) {
  if (!adsenseActive()) return null;
  return (
    <AdsenseSlot
      placement={placement}
      slot={adsenseSlot}
      enabled={adsenseEnabled}
      nonce={nonce}
    />
  );
}
