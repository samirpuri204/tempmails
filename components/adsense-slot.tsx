"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { preconnect, preload } from "react-dom";

export const ADSENSE_ACCOUNT = "ca-pub-3624892885273135";
export const ADSENSE_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ACCOUNT}`;

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export default function AdsenseSlot({
  slot = "",
  enabled = false,
  nonce,
  placement,
  label = true,
}: {
  slot?: string;
  enabled?: boolean;
  nonce?: string;
  placement: string;
  /**
   * Set false when the unit is rendered inside a frame that already carries the
   * "Advertisement" label — a fallback inside `AdSlot` — so a position never
   * shows the label twice.
   */
  label?: boolean;
}) {
  const element = useRef<HTMLModElement>(null);
  const requested = useRef(false);
  const active = enabled && /^\d{1,20}$/.test(slot);

  // Hoisted into <head> during SSR: the browser opens the connections and
  // starts downloading adsbygoogle.js while the HTML is still streaming,
  // instead of waiting for hydration to insert the <script> tag.
  if (active) {
    preconnect("https://pagead2.googlesyndication.com", { crossOrigin: "anonymous" });
    preconnect("https://googleads.g.doubleclick.net");
    preconnect("https://tpc.googlesyndication.com");
    preload(ADSENSE_SRC, { as: "script", crossOrigin: "anonymous", nonce });
  }

  useEffect(() => {
    if (!active || !element.current || requested.current) return;
    // Push as soon as the <ins> has a width. adsbygoogle is a queue: if the
    // library has not finished loading yet it picks the request up the
    // moment it does, so there is no need to wait for the script's onReady.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width <= 0 || requested.current) return;
      requested.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // Ad blockers or an unapproved unit must not interrupt the inbox.
      }
      observer.disconnect();
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [active]);

  // Unconfigured or disabled slots render nothing at all. An empty
  // "Advertisement" divider looks broken and costs trust for zero revenue —
  // which is why the same rule governs the fallback path: no slot id, no mount.
  if (!active) return null;

  const unit = (
    <>
      <Script
        id="google-adsense"
        nonce={nonce}
        async
        crossOrigin="anonymous"
        src={ADSENSE_SRC}
      />
      {/* Height is reserved via CSS so a late fill cannot shift the layout. */}
      <ins
        ref={element}
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={ADSENSE_ACCOUNT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );

  if (!label) return unit;

  return (
    <aside
      className="adsense-placement"
      aria-label={`Advertisement — ${placement}`}
    >
      <span className="adsense-label">Advertisement</span>
      {unit}
    </aside>
  );
}
