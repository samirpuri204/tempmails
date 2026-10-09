// The only *lib* module that touches the DOM to load ad-network code. The one
// other place that does is components/ads/social-bar.tsx, which loads the
// Adsterra Social Bar; it owns a single script tag with none of the state this
// module has to keep, so it is not worth a second lib module here.
//
// Monetag's Multitag is one script for the whole site. Everything such an
// integration has to get right lives here, so no component has to reason about
// it:
//
//   1. ONCE PER DOCUMENT. Duplicate detection asks the *document* whether a
//      script with that exact URL is currently present, rather than keeping a
//      module-level "already loaded" flag. A flag would be wrong in whichever
//      direction the document happened to disagree with it — most sharply after
//      a navigation that replaced the page's scripts.
//   2. NO RETRIES. A tag that fails to load stays in the document, so it is
//      still found by the check above and is never re-requested. There is no
//      polling loop and no backoff, so an ad blocker cannot turn into repeated
//      network attempts.
//   3. FAIL SOFT. Insertion failures are swallowed. Ads are the least important
//      thing on a page that also has to deliver temporary email.
//   4. THE TAB STAYS HONEST. Ad overlays commonly rewrite `document.title` to a
//      fake unread-mail badge. `guardDocumentTitle()` reverts exactly that
//      shape, so the format earns and the tab still answers "has my code
//      arrived?" truthfully.
//
// Deliberately NOT used here: `dangerouslySetInnerHTML`. Inserting the official
// snippet imperatively keeps it in one reviewable place, lets us attach the CSP
// nonce and the required `data-zone`/`data-cfasync` attributes, and lets us
// refuse a duplicate.

import { monetag, monetagActive } from "./ad-config";

export type AdLoadResult =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "unconfigured" | "unavailable" | "failed" };

/** A Monetag zone id: digits only. Anything else is not a tag we can serve. */
const ZONE_ID = /^\d{1,12}$/;

/**
 * True when a script with this exact URL is currently in the document.
 *
 * This is the duplicate check. It reads the DOM rather than a module-level flag
 * so a tag removed along with a page's scripts is treated as absent — see rule
 * 1 at the top of this file.
 */
export function tagPresent(src: string): boolean {
  if (typeof document === "undefined") return false;
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[src]");
  if (!scripts) return false;
  return Array.from(scripts).some(
    (element) => element?.src === src || element?.getAttribute("src") === src,
  );
}

/**
 * The CSP nonce for this request. Next.js emits it on its own script tags, so
 * it can be recovered from the document when a component has no access to the
 * request headers. `strict-dynamic` already authorises scripts we insert from
 * our own bundle; the nonce is belt and braces for configurations that drop it.
 */
function currentNonce(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const script = document.querySelector<HTMLScriptElement>("script[nonce]");
  return script?.nonce || script?.getAttribute("nonce") || undefined;
}

/**
 * Inserts the Monetag tag, exactly as the network publishes it:
 * `<script src="https://quge5.com/88/tag.min.js" data-zone="…" async
 * data-cfasync="false">`.
 *
 * `data-cfasync="false"` tells Cloudflare's Rocket Loader to leave the tag
 * alone; without it the loader can defer or rewrite the script and the zone
 * never initialises.
 */
export function loadMonetagTag(options: { nonce?: string } = {}): AdLoadResult {
  if (!monetagActive()) return { ok: false, reason: "unconfigured" };
  if (typeof document === "undefined") return { ok: false, reason: "unavailable" };
  const { src, zone } = monetag;
  if (!src || !ZONE_ID.test(zone)) return { ok: false, reason: "unconfigured" };
  if (tagPresent(src)) return { ok: false, reason: "duplicate" };
  try {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.zone = zone;
    script.dataset.cfasync = "false";
    const nonce = options.nonce || currentNonce();
    if (nonce) script.nonce = nonce;
    script.onerror = () => {
      // A blocked or unavailable tag is expected: an ad blocker, a filtering
      // resolver or VPN, or a policy rejection. Stay silent. The element stays
      // in the document, so `tagPresent` still finds it and the failed request
      // is never repeated.
      //
      // The marker is what lets a *blocked* page be told apart from a page the
      // tag simply did not fill later: a host the visitor's network refuses to
      // resolve is a different problem from a zone with nothing to serve, and
      // only the first is worth acting on. It never changes what loads.
      script.dataset.blocked = "1";
    };
    document.body.appendChild(script);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Titles an ad overlay sets to impersonate an unread-mail badge.
 *
 * Overlay networks rewrite `document.title` to `(1) New Message!` — the shape of
 * a mail client's unread badge — on a site whose entire product is answering
 * "has my code arrived?". The pattern is deliberately narrow: `(n) New Message`,
 * `1 new mail`, `You have 3 new messages` and close variants match; a real page
 * title never does.
 */
const FAKE_NOTIFICATION_TITLE =
  /^\s*(?:\(\d+\)\s*)?(?:you\s+have\s+)?\d*\s*new\s+(?:message|mail)/i;

/**
 * Keeps the tab honest while an overlay format is running.
 *
 * Watches `<title>` and reverts a notification-shaped rewrite to the title the
 * page actually had. The last honest title is remembered on every other change,
 * so client-side navigation still updates the tab normally — only the fake badge
 * is refused. Returns the disposer, so a caller owns the observer's lifetime.
 *
 * Cheap by construction: it observes `<head>` rather than the whole document,
 * where mutations are rare next to a live inbox's re-renders, and the callback
 * does one string comparison.
 */
export function guardDocumentTitle(): () => void {
  if (typeof document === "undefined") return () => {};
  const head = document.head;
  if (!head || typeof MutationObserver === "undefined") return () => {};
  let honest = document.title;
  const check = () => {
    if (FAKE_NOTIFICATION_TITLE.test(document.title)) {
      // Restoring the title re-enters this callback; the restored text never
      // matches the pattern, so the second pass records it and stops.
      document.title = honest;
      return;
    }
    honest = document.title;
  };
  const observer = new MutationObserver(check);
  observer.observe(head, { childList: true, subtree: true, characterData: true });
  // The rewrite can land between the script being inserted and the observer
  // being armed, so run the check once immediately.
  check();
  return () => observer.disconnect();
}

/**
 * What happened to the ad tag: it loaded, or the ad host never answered.
 *
 * The two are worth separating because they have different owners. `blocked` is
 * the visitor's network or browser refusing the ad host — an ad blocker, a
 * resolver that filters ad domains, or a policy rejection. `filled` is the tag
 * reaching the document, which is the only state in which any Monetag format
 * can serve, and the only one that earns. `empty` exists for completeness: a tag
 * that loaded and a zone the network had nothing for.
 */
export type AdFillState = "filled" | "blocked" | "empty";

/** Reads the outcome of the tag load from the document. */
export function tagState(): AdFillState {
  if (typeof document === "undefined") return "empty";
  if (!tagPresent(monetag.src)) return "empty";
  const loaded = Array.from(
    document.querySelectorAll<HTMLScriptElement>("script[src]"),
  ).find((element) => element?.src === monetag.src || element?.getAttribute("src") === monetag.src);
  return loaded?.dataset?.blocked ? "blocked" : "filled";
}

/** Where the tag report is posted. The route lives in `lib/public-api.ts`. */
export const AD_FILL_ENDPOINT = "/api/ads/fill";

/** The placement name the tag reports under, so /admin can attribute it. */
export const MONETAG_PLACEMENT = "monetag tag";

/**
 * Tells the server whether the tag loaded, so a session with no ad can be
 * diagnosed from the admin console instead of from a browser, a VPN and a guess.
 *
 * Fire and forget by design: no retry, no queue, never let a failure surface.
 * `keepalive` means the report still lands when the visitor navigates away in
 * the same moment the window closes.
 */
export function reportAdFill(placement: string, state: AdFillState): void {
  if (typeof fetch !== "function") return;
  try {
    void fetch(AD_FILL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ placement, state }),
    }).catch(() => {});
  } catch {
    // An ad must never be able to interrupt the inbox, a message, or a guide.
  }
}

/** The ad assets this build would request, for CSP review and the probe. */
export const monetagRequests = () => [monetag.src];
