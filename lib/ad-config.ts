// Centralised advertising configuration.
//
// Single source of truth for every ad unit in the app. Nothing else reads ad
// environment variables, and no component decides on its own whether ads run.
//
// ---------------------------------------------------------------------------
// ONE SWITCH DISABLES EVERYTHING
// ---------------------------------------------------------------------------
//   NEXT_PUBLIC_ADS_ENABLED=false
//
// ---------------------------------------------------------------------------
// NETWORKS
// ---------------------------------------------------------------------------
//   Monetag (default)  A single tag script for the whole site. The zone decides
//                      which formats run — vignette, in-page push, interstitial,
//                      onclick/popunder — and Monetag positions them itself, so
//                      this network never fills a container of ours.
//                      Zone 282200, served from quge5.com.
//   AdSense            Container units. The only network that can occupy a
//                      named in-content position, using the slot ids configured
//                      in /admin. Also the network that serves sessions a
//                      popunder-style network declines (VPN and datacenter
//                      traffic), which is why it is worth having.
//   Adsterra           Banner unit: an iframe 468x60 from the zone's loader
//                      host. The only re-added network — reinstated on the
//                      owner's instruction after the 2026-09-18 migration. See
//                      docs/MONETIZATION-MIGRATION-REPORT.md for the record of
//                      that migration; the removal-enforcement test was weakened
//                      to allow the new Adsterra files rather than removed.
//
// `NEXT_PUBLIC_ADS_PROVIDER` chooses: `monetag` (default), `adsense`, `both` or
// `none`. Only one network ever occupies a container position, so two units can
// never stack on the same spot. Adsterra is a banner network, not a container
// network: it is not gated by the provider switch, and it coexists with the
// others because it occupies a position none of them claim.

/** Parses a boolean-ish env value; an unset/blank value keeps `fallback`. */
const flag = (raw: string | undefined, fallback: boolean) => {
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const text = (raw: string | undefined, fallback = "") => {
  const value = (raw ?? "").trim();
  return value || fallback;
};

const positiveInt = (raw: string | undefined, fallback: number) => {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Like `positiveInt`, but 0 is a real value rather than a missing one. */
const nonNegativeInt = (raw: string | undefined, fallback: number) => {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/**
 * Monetag's Multitag.
 *
 * One script for the entire site. The zone below is the one the owner supplied;
 * which formats run and how often is a dashboard setting on Monetag's side, not
 * something this repository controls. The tag is inserted by our own nonced
 * bundle, so 'strict-dynamic' authorises it and no host needs allowlisting in
 * `script-src` — see docs/MONETIZATION.md §8.
 */
const zone = text(process.env.NEXT_PUBLIC_MONETAG_ZONE, "282200");

const src = text(process.env.NEXT_PUBLIC_MONETAG_SRC, "https://quge5.com/88/tag.min.js");

export const monetag = { zone, src };

export type AdProvider = "monetag" | "adsense" | "both" | "none";

const PROVIDERS: AdProvider[] = ["monetag", "adsense", "both", "none"];

/**
 * The configured provider, defaulting to Monetag.
 *
 * An unrecognised value — most importantly a leftover one from a network that
 * has been removed — falls back to the default instead of quietly disabling
 * every ad. Reading a stale variable should never be able to turn the site's
 * revenue off without anything saying so.
 */
const provider = (() => {
  const raw = text(process.env.NEXT_PUBLIC_ADS_PROVIDER, "monetag");
  return (PROVIDERS as string[]).includes(raw) ? (raw as AdProvider) : "monetag";
})();

export const adConfig = {
  provider,
  enabled: flag(process.env.NEXT_PUBLIC_ADS_ENABLED, true),
  /**
   * ON by default. With this off, no tag is inserted, no request is made to
   * Monetag, and no overlay format can appear.
   */
  monetagEnabled: flag(process.env.NEXT_PUBLIC_MONETAG_ENABLED, true),
  /**
   * How long the tag waits after hydration before it is inserted.
   *
   * The tag is a whole-site overlay: loading it before the inbox has painted
   * would compete with the only thing a visitor came for, and the first
   * interaction is usually a second or two after the page settles. Short enough
   * that a visitor who bounces quickly still earns.
   */
  delayMs: nonNegativeInt(process.env.NEXT_PUBLIC_MONETAG_DELAY_MS, 900),
  /**
   * How long after the tag is inserted its outcome is read.
   *
   * A blocked tag fails *after* insertion — the request leaves and never comes
   * back — so reading the document in the same tick would record every blocked
   * session as a fill. This window is the time the request is given to fail
   * before the outcome is read: long enough for a slow mobile connection, short
   * enough that the report still lands before a visitor leaves.
   */
  fillWindowMs: positiveInt(process.env.NEXT_PUBLIC_ADS_FILL_WINDOW_MS, 4000),
  /**
   * Reports whether the ad tag actually loaded, once per page view.
   *
   * This exists because "the ad does not show" has causes that look identical
   * from the outside — a VPN or datacenter address the network declines, an ad
   * blocker, a filtering resolver, a policy rejection — and guessing between
   * them wastes more time than measuring them. What is sent is a country (read
   * server-side from the platform's own header, never from the browser), a
   * placement name and an outcome. No IP, no cookie, no user agent, no
   * per-visitor record: the counters are aggregate and expire after 30 days.
   * Nothing about ad delivery is ever decided by them.
   */
  reportFill: flag(process.env.NEXT_PUBLIC_ADS_FILL_REPORT, true),
  monetag,
};

/** Origin of every ad host we actually load, for CSP review and preconnect. */
export const monetagOrigins = [
  ...new Set(
    [monetag.src]
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  ),
];

/**
 * Adsterra banner zone.
 *
 * Reinstated on the owner's instruction after the 2026-09-18 migration that
 * removed Adsterra in favour of Monetag. See
 * docs/MONETIZATION-MIGRATION-REPORT.md for the record of that migration, and
 * tests/ads.test.ts for the (now-weakened) enforcement of it.
 *
 * This is a banner network, not a container network and not a tag network:
 * the zone's loader inserts one iframe per placement, so it occupies a position
 * none of the other two networks claim, and it is deliberately NOT gated by the
 * provider switch. It coexists with Monetag and AdSense rather than competing
 * with either for a container.
 *
 * The loader host below is the domain that currently serves this zone's
 * invoke script (`https://doubtfulimpatient.com/<key>/invoke.js`). Adsterra
 * serves zones from a rotating set of domains, so this origin is a snapshot of
 * whatever host the dashboard gave for this zone at reinstatement time; if the
 * dashboard later points this zone at a different host, update the env value and
 * redeploy. Do not assume `adsterra.com` is the origin.
 */
const adsterraKey = text(process.env.NEXT_PUBLIC_ADSTERRA_KEY, "667e12baeee8c82d264233fab2ccfd93");

const adsterraHost = text(process.env.NEXT_PUBLIC_ADSTERRA_HOST, "https://doubtfulimpatient.com");

export const adsterra = {
  /** The zone key, verbatim from the Adsterra snippet: `key: '...'`. */
  key: adsterraKey,
  /** Origin of the loader host, for CSP review and preconnect. */
  host: adsterraHost,
  /**
   * The loader URL the snippet embeds: `<host>/<key>/invoke.js`.
   *
   * This is what the ad-health probe hits, and what a preconnect warms — never
   * a hardcoded domain.
   */
  get invokeUrl() {
    return `${this.host.replace(/\/+$/, "")}/${this.key}/invoke.js`;
  },
  /**
   * The banner format we render for this zone. At reinstatement this is the
   * iframe 468x60 from the snippet; a future format would be a different
   * component or a prop, not a change to this config.
   */
  format: "iframe" as const,
  /** Banner dimensions, from the snippet: `height: 60, width: 468`. */
  height: 60,
  width: 468,
};

/**
 * Adsterra Social Bar zone — a second unit on the same Adsterra account.
 *
 * Deliberately a separate entry rather than a second field on `adsterra` above,
 * because the two units have genuinely different publisher snippets:
 *
 *   Banner      an `atOptions` block declaring key/format/height/width, then an
 *               `invoke.js` loader. The format has to be declared *before* the
 *               loader runs, which is why the component inserts two scripts in
 *               a fixed order.
 *   Social Bar  one plain script tag, and nothing else. There is no `atOptions`
 *               and no `invoke.js`; the key is repeated inside a sharded path.
 *
 * Reproducing one as the other produces a request the network does not
 * recognise, so the shape is recorded here rather than assumed.
 *
 * The URL is stored whole, verbatim from the dashboard's GET CODE output, and
 * NOT reassembled from host + key the way the banner's `invokeUrl` is: the
 * sharded segment order is Adsterra's own scheme, and rebuilding it in code
 * would encode a guess about a layout this repository does not control. Only
 * the host is shared with the banner — which is why this unit adds no new
 * preconnect origin.
 *
 * Adsterra's own instruction for this unit is to place it immediately above the
 * closing </body> tag, which is exactly where the root layout mounts it.
 */
const socialBarSrc = text(
  process.env.NEXT_PUBLIC_ADSTERRA_SOCIAL_BAR_SRC,
  "https://doubtfulimpatient.com/cb/da/4c/cbda4cbf2b82f3025938bd54a7789f12.js",
);

export const adsterraSocialBar = {
  /** The publisher snippet's URL, character for character. */
  src: socialBarSrc,
  /** Origin of the loader, for CSP review. Already covered by the banner host. */
  get origin() {
    try {
      return new URL(this.src).origin;
    } catch {
      return "";
    }
  },
  /** The unit this URL belongs to, from the dashboard, for the ad-health probe. */
  unitId: "31284981",
};

/** Origin of every ad host we actually load, for CSP review and preconnect. */
export const adsterraOrigins = [
  ...new Set(
    [adsterra.host]
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  ),
];

/** The ad hosts this build would actually request, for CSP review and preconnect.
 *
 * Kept as a single combined list rather than per-network so the layout and the
 * CSP code can warm connections and review origins without knowing which
 * networks are present. When a network is added or removed, change only the
 * network's own block in this file.
 *
 * The Social Bar is absent here on purpose, not by oversight: its loader is
 * served from the same host as the banner, so its origin is already in this
 * list. A unit that ever moves to a different host has to be added below.
 */
export const adOrigins = [
  ...new Set(
    [
      ...monetagOrigins,
      ...adsterraOrigins,
    ]
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  ),
];

/** True when the Monetag tag is allowed to load at all. */
export const monetagActive = () =>
  adConfig.enabled &&
  adConfig.monetagEnabled &&
  (adConfig.provider === "monetag" || adConfig.provider === "both");

/** True when AdSense units are allowed to render at all. */
export const adsenseActive = () =>
  adConfig.enabled &&
  (adConfig.provider === "adsense" || adConfig.provider === "both");

/** True when the Adsterra banner is allowed to load at all.
 *
 * Adsterra is a banner network, not gated by the provider switch: it coexists
 * with Monetag and AdSense and occupies a position neither of them claims.
 * The only hard off switch is the site-wide `NEXT_PUBLIC_ADS_ENABLED`.
 */
export const adsterraActive = () =>
  adConfig.enabled && adsterra.key && adsterra.host;

/** True when the Adsterra Social Bar is allowed to load at all.
 *
 * Same reasoning as the banner above: it is a second unit on a banner network,
 * so it is not gated by the provider switch.
 *
 * The off switch is the site-wide `NEXT_PUBLIC_ADS_ENABLED=false`. Note that a
 * blank `NEXT_PUBLIC_ADSTERRA_SOCIAL_BAR_SRC` does NOT disable the unit: `text()`
 * treats blank as "unset" and falls back to the recorded default, which is the
 * same fail-safe that keeps a stale env value from turning revenue off. To drop
 * this unit alone, delete its mount in the root layout.
 */
export const socialBarActive = () => adConfig.enabled && !!adsterraSocialBar.src;
