"use client";

import { useEffect } from "react";
import { adConfig, monetagActive } from "@/lib/ad-config";
import {
  MONETAG_PLACEMENT,
  guardDocumentTitle,
  loadMonetagTag,
  reportAdFill,
  tagState,
} from "@/lib/monetag";

/**
 * The Monetag tag, mounted exactly once for the whole site.
 *
 * This network is tag-based: the zone decides which formats run, and the unit
 * positions itself. There is no container for us to place, which is why this
 * component renders nothing at all and lives in the root layout rather than
 * being repeated per position.
 *
 * It waits `adConfig.delayMs` after hydration before inserting anything, so the
 * overlay cannot compete with the first paint of the inbox, and it is skipped
 * entirely on `/admin` — the console is not a public page and must never carry
 * ad code.
 *
 * The outcome is reported once per page view (did the tag reach the document,
 * or did the ad host never answer) so an empty session can be diagnosed from
 * /admin instead of re-run through a VPN. See `lib/monetag.ts`.
 */
export default function MonetagTag({ nonce }: { nonce?: string }) {
  useEffect(() => {
    if (!monetagActive()) return;
    if (typeof window === "undefined") return;
    // The admin console and API-driven views are not public pages.
    if (window.location.pathname.startsWith("/admin")) return;
    // Respect data saver: a visitor paying per megabyte is not a visitor to
    // spend an overlay on.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    let report: ReturnType<typeof setTimeout> | undefined;
    const insert = setTimeout(() => {
      let result: ReturnType<typeof loadMonetagTag> = { ok: false, reason: "unavailable" };
      try {
        result = loadMonetagTag({ nonce });
      } catch {
        // Never let an ad failure reach the app.
      }
      // Armed whether or not this call inserted the tag: a remount or a React
      // strict-mode double-invoke returns `duplicate`, and the guard has to
      // survive it rather than being dropped along with the second call.
      guardDocumentTitle();
      if (!adConfig.reportFill) return;
      // `duplicate` means the tag is already live from an earlier mount, which
      // is a fill, not an absence — read the document rather than the result.
      if (!result.ok && result.reason !== "duplicate") {
        reportAdFill(MONETAG_PLACEMENT, "empty");
        return;
      }
      // Read the outcome after the window, not now: a blocked tag fails
      // *after* insertion, so a same-tick read would call every blocked
      // session a fill — the one distinction this report exists to make.
      report = setTimeout(() => {
        reportAdFill(MONETAG_PLACEMENT, tagState());
      }, adConfig.fillWindowMs);
    }, adConfig.delayMs);

    return () => {
      clearTimeout(insert);
      if (report) clearTimeout(report);
    };
  }, [nonce]);

  return null;
}
