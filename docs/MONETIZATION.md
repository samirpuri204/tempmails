# Advertising integration

Provider: **Monetag** — a single whole-site tag (zone `282200`), with **Google
AdSense** available as the alternate provider behind the same placement API.

The previous provider was a container-based network, removed on 2026-09-18. What
was removed, why, and how it was verified is recorded in
`docs/MONETIZATION-MIGRATION-REPORT.md` — which is also the one file allowed to
name it, so its identifiers cannot reappear in shipped code unnoticed.

| Concern | Where it lives |
|---|---|
| Configuration and defaults | `lib/ad-config.ts` |
| The only code that touches the DOM | `lib/monetag.ts` |
| Components | `components/ads/` |
| The site-wide tag | `components/ads/monetag-tag.tsx`, mounted in `app/layout.tsx` |
| An in-content position | `components/ads/placement.tsx` (AdSense) |
| Environment variables | `.env.example` |
| Visual treatment | `.adsense-placement` block in `app/globals.css` |

The two networks are different shapes, and the code reflects that:

- **Monetag is tag-based.** One script for the whole site. The zone decides which
  formats run — vignette, in-page push, interstitial, onclick/popunder — and
  Monetag places them itself. It never fills a container of ours, so it cannot be
  handed a position.
- **AdSense is container-based.** It is the only network here that occupies a
  named in-content position, using the slot ids configured in `/admin`.

---

## 1. Turning everything off

```
NEXT_PUBLIC_ADS_ENABLED=false
```

One variable. With it set, no tag is inserted, no AdSense unit renders, and
**no reserved empty space** is left anywhere on the site.

Because `NEXT_PUBLIC_*` values are inlined at build time, this needs a rebuild —
set it in the host environment and redeploy. Editing it on a running server does
nothing, and no ad behaviour can be changed from `/admin`.

Finer-grained switches, all optional:

```
NEXT_PUBLIC_ADS_PROVIDER=monetag    # monetag | adsense | both | none
NEXT_PUBLIC_MONETAG_ENABLED=false    # stops the tag, leaves AdSense alone
NEXT_PUBLIC_MONETAG_ZONE=282200      # the zone, if Monetag issues another
NEXT_PUBLIC_MONETAG_DELAY_MS=900     # wait after hydration, 0 = immediately
NEXT_PUBLIC_ADS_FILL_REPORT=false    # stop sending the outcome report
```

`NEXT_PUBLIC_ADS_PROVIDER` exists because the two must never share a position:
`monetag` (the default) means no AdSense unit renders even where a slot id is
configured, and `adsense` means no tag is inserted. `both` runs the tag *and*
lets AdSense fill configured positions; the two still never occupy the same spot.

An unrecognised value falls back to the default rather than turning ads off. That
is deliberate: a leftover `NEXT_PUBLIC_ADS_PROVIDER` naming a removed network
should not be able to silence the site's advertising without anything saying so,
which is exactly how the site once ended up with no ads at all.

---

## 2. Placement map

| Page | Position | Placement name | Component call site |
|---|---|---|---|
| `/` | Under the inbox card | `homepage primary` | `components/inbox.tsx` |
| `/` | After "how it works" | `homepage mid` | `components/inbox.tsx` |
| `/` | End of page | `homepage footer` | `components/inbox.tsx` |
| Guides | Under the title | `article top` | `components/content-shell.tsx` default pair |
| Guides | After the body | `article footer` | `components/content-shell.tsx` default pair |
| `/blog` | End of the listing | `journal hub` | `app/blog/page.tsx` |
| `/blog/<slug>` | After the opening paragraph | `journal after introduction` | `app/blog/[slug]/page.tsx` via `Body` |
| `/blog/<slug>` | Mid-article | `journal mid-article` | `app/blog/[slug]/page.tsx` via `Body` |
| `/blog/<slug>` | Near the end | `journal end of article` | `app/blog/[slug]/page.tsx` |

Budget per page type: homepage 3, long article 3, listing hub 1, static
informational page 1–2. Nothing else carries a unit.

Separately from any of these, the Monetag tag runs on **every public page**,
because it places its own formats. It is never mounted on `/admin`, and never in
a session with Data Saver on.

**A position renders only when AdSense has a slot id for it.** Today every slot
id in the live settings row is empty, so all nine positions above render nothing
at all — no label, no reserved box. Paste a numeric `data-ad-slot` for a position
into `/admin` → *Google AdSense* and that position comes alive on the next
request. That is also the lever for VPN/datacenter visitors, which Monetag
declines: AdSense serves sessions a popunder-style network will not.

**No placement is withheld from a country.** Eligibility is the environment
flags and nothing else: no ad code reads a geo header, the visitor's IP, or
`Accept-Language`, and no unit is enabled or disabled per region
(`tests/ads.test.ts`, "ad eligibility", enforces this). Two consequences worth
knowing. First, a session with no ad is always a network decision or a
configuration problem — never a geographic one. Second, whether a *specific
visitor* is served is still the network's decision: Monetag fills by country,
device and remaining demand, so a zone can legitimately serve 100% of one
country's requests and nothing in another, and that is inventory, not code.

---

## 3. The tag, and the one behaviour that is refused

`components/ads/monetag-tag.tsx` is mounted exactly once, in `app/layout.tsx`, so
there is a single instance for the whole site. It renders nothing into the tree —
the tag is inserted imperatively into `<body>` — and it never mounts per page.

It waits `NEXT_PUBLIC_MONETAG_DELAY_MS` (900 ms by default) after hydration before
it inserts anything, so an overlay cannot compete with the first paint of the
inbox, and it skips:

- `/admin`, by pathname — the console is not a public page;
- a session with `navigator.connection.saveData` set — a visitor paying per
  megabyte is not a visitor to spend an overlay on.

The tag is inserted exactly as Monetag publishes it, including the two attributes
that matter:

```html
<script src="https://quge5.com/88/tag.min.js" data-zone="282200" async data-cfasync="false"></script>
```

`data-zone` tells the tag which formats to run; `data-cfasync="false"` stops
Cloudflare's Rocket Loader from deferring or rewriting the script into a state
where the zone never initialises.

Overlay networks commonly rewrite `document.title` to `(1) New Message!` — the
shape of a mail client's unread badge. That is refused. TempMails' entire purpose
is answering "has my code arrived?", and a tab that answers falsely is worth less
than the unit earns; it is also the one thing that presents an advertisement as a
system control. `guardDocumentTitle()` in `lib/monetag.ts` watches `<head>` and
restores the title the page actually had whenever one arrives in that shape. The
match is deliberately narrow:

```
/^\s*(?:\(\d+\)\s*)?(?:you\s+have\s+)?\d*\s*new\s+(message|mail)/i
```

The last honest title is re-recorded on every other change, so client-side
navigation still updates the tab normally and only the fake badge is refused. The
observer watches `<head>` rather than the whole document, where mutations are rare
next to a live inbox's re-renders. This is attribution-preserving, not
code-patching: the tag runs its own script unmodified, and the site declines to
show a notification it did not ask for.

---

## 4. What the loader guarantees

`lib/monetag.ts` is the only module in the app that inserts ad-network code, and
it enforces four properties in one place:

1. **Once per document.** Duplicate detection asks the *document* whether a
   script with that exact URL is present, rather than keeping a module-level
   "already loaded" flag. A flag would be wrong in whichever direction the
   document disagreed with it — a layout remount or a strict-mode double-invoke
   would either insert a second tag or refuse to insert the first.
2. **No retries.** The failed element stays in the document, so it is still found
   and never re-requested. There is no polling loop, no backoff and no
   re-injection on re-render, so an ad blocker cannot become repeated network
   attempts.
3. **Fail soft.** Insertion is wrapped in `try/catch` and the script's `onerror`
   is swallowed. An ad network cannot throw into the inbox.
4. **A valid zone only.** The zone must be digits. A paste marker like
   `PASTE_ZONE_ID_HERE` is refused rather than requested.

`dangerouslySetInnerHTML` is **not** used for any part of the integration. The
official snippet is pasted as behaviour, not markup: pasting third-party HTML into
the React tree would place foreign markup inside our own document next to the
inbox, and would make the injection impossible to deduplicate or cancel.
Inserting it imperatively keeps it in one reviewable file and lets the request
nonce be attached. If a future snippet genuinely cannot work without raw HTML,
isolate it in a single component, document why, and keep it out of anything that
renders mail.

---

## 5. Core Web Vitals

- **CLS.** AdSense units reserve their height in CSS (`.adsense-placement
  .adsbygoogle`) before the library is asked for anything, and `contain: layout`
  keeps the reservation from reaching the rest of the page. The Monetag tag
  injects no element into the document flow at all, so it cannot shift layout.
- **Delay.** The tag is inserted after `NEXT_PUBLIC_MONETAG_DELAY_MS`, so the
  critical path — HTML, hydration, the inbox — is finished first.
- **No render blocking.** The tag is created with `async = true` and appended
  after mount; nothing ad-related is added to `<head>` except a `preconnect` hint.
- **No request until a slot exists.** An AdSense position with no slot id renders
  nothing, so an unconfigured site downloads no ad library at all.

---

## 6. Privacy, security and SEO boundaries

- **No ad code inside mail.** No ad component is rendered in the message list,
  the message viewer, the HTML email iframe or any element that displays received
  content. The components are isolated in `components/ads/` and only ever mounted
  by page shells and the journal layout, never by a mail-rendering component.
  There is no unit between individual messages, and no unit inside the
  `address-card` or `inbox-card`.
- **Labelling.** Every AdSense unit renders a visible `Advertisement` label with
  `aria-label="Advertisement — <position>"`, styled to be clearly distinct from
  navigation and from application buttons. A network that places its own overlay
  is not labelled by us; it is the network's own format.
- **SEO.** Ads sit outside the primary content, are never referenced from
  structured data, and add no `canonical`, `robots`, sitemap or `robots.txt`
  change. `npm run seo:check` passes with ads enabled.
- **No arbitrary third-party code.** Only the Monetag tag, the AdSense library
  and Cloudflare Turnstile load. No npm advertising package is installed.
- **Admin.** `/admin` never renders an ad component and the tag skips it by
  pathname as well.
- **Disclosure.** The privacy page names Monetag and Google AdSense as the
  advertising providers (`lib/content.ts`), and says that message contents are
  never an input to advertising.

---

## 7. CSP

```
script-src 'self' 'nonce-<per-request>' 'strict-dynamic' 'unsafe-eval' https://challenges.cloudflare.com
```

Under `'strict-dynamic'`, a script created by a script we already trust is itself
trusted — and our bundle is nonced by `proxy.ts`. Host allowlists are ignored by
`strict-dynamic` in every browser that matters, so adding `quge5.com` to
`script-src` would broaden the policy for nothing. The loader also sets the
request nonce on the tag when it can recover it from the document, as a fallback
for a configuration that drops `strict-dynamic`.

### Why the public pages carry `'unsafe-eval'`

Ad tags evaluate strings at runtime. `proxy.ts` grants `'unsafe-eval'` to the
public pages and **withholds it from `/admin` and `/api`**, which mount no ad
component:

```
/                → script-src 'self' 'nonce-…' 'strict-dynamic' 'unsafe-eval' https://challenges.cloudflare.com
/admin, /api/…   → script-src 'self' 'nonce-…' 'strict-dynamic'                 https://challenges.cloudflare.com
```

That split is the whole point: the operator console and every JSON endpoint — the
things that read mail, settings and credentials — keep the strict policy, so a
string-injection bug there still cannot reach `eval()`. `'unsafe-eval'` does not
open a new script source anywhere; `nonce` + `'strict-dynamic'` still decide what
may run, and no ad host is allowlisted. What it gives up is one defence-in-depth
layer on the public pages. `contentSecurityPolicy()` is unit-tested on that
boundary (`tests/ads.test.ts`, "content security policy") so it cannot drift.

To restore the strictest policy, set `NEXT_PUBLIC_ADS_ENABLED=false` **and** drop
`'unsafe-eval'` from `contentSecurityPolicy()` — or verify first, in a browser,
that the tag still initialises without it, and then drop only the directive.

Existing directives already cover the rest:

| Directive | Value | Covers |
|---|---|---|
| `frame-src` | `'self' https:` | creatives Monetag and AdSense frame |
| `img-src` | `'self' data: https:` | creative images and beacons |
| `connect-src` | `'self' https:` | the networks' XHR/beacon calls |

`style-src` and `font-src` additionally allow `https://fonts.googleapis.com` and
`https://fonts.gstatic.com` **on the ad-bearing pages only**, scoped exactly like
`'unsafe-eval'`. That is measured, not speculative: an overlay injects its own
Google Fonts stylesheet, and blocking it made every page view log a CSP violation
and render the unit in the browser's fallback font. CSS and fonts cannot execute,
so the grant adds no script source anywhere, and `/admin` and `/api` keep the
tightest policy.

Hosts the site itself loads, derived from the configuration:
`https://quge5.com` (the tag) and `https://pagead2.googlesyndication.com` (the
AdSense library). The tag then contacts its own serving host from a rotating
domain pool — observed on production: `6opo.com` — which is authorised by
`'strict-dynamic'` and the `https:` directives rather than by an allowlist, so a
rotation cannot silently break the integration. `monetagOrigins()` in
`lib/ad-config.ts` exports the tag's origin from the live config, so the
`preconnect` hint in `app/layout.tsx` cannot drift from the script that is
actually requested.

**If you ever drop `'strict-dynamic'`**, `quge5.com` must be added to
`script-src` explicitly, or the tag will be blocked.

---

## 8. Verifying

```bash
npm test                     # unit + editorial tests, incl. the ad contracts
npm run build && npm start   # the real tag, not a dev placeholder
npm run seo:check            # crawler contract must still pass
```

In the browser, with ads enabled and a devtools network panel:

1. One request to `quge5.com/88/tag.min.js`, and none to any other ad host. The
   removed network's hosts must not appear anywhere.
2. No second tag after client-side navigation, and none on `/admin`.
3. Console shows no error originating from our code, and no CSP violation. A
   blocked ad may still show the browser's own "failed to load resource" line —
   that is the network being blocked, and the page must be unaffected.
4. Response headers show `'unsafe-eval'` on a public page and its absence on
   `/admin` and `/api/…`, and the tab title never becomes `(1) New Message!`.
5. With `NEXT_PUBLIC_ADS_ENABLED=false`, a rebuilt page contains no ad script and
   no `.adsense-placement` element.

---

## 9. "No ad is showing" — what that can mean, and how to tell them apart

The tag is requested on every public page, for every visitor, in every country
(§2). So a session with no ad is one of the following, and they look different
from each other:

| Symptom | Cause | What fixes it |
|---|---|---|
| The `tag.min.js` request never appears, or fails with `ERR_BLOCKED_BY_CLIENT` / `ERR_NAME_NOT_RESOLVED`. Reported as **blocked** | An ad blocker, or a VPN/extension whose DNS filter sinks ad hosts | Nothing on the site's side — the visitor's network refused the ad host. Check in a clean profile without the VPN's ad-filtering resolver. |
| `tag.min.js` returns 200, still no ad. Reported as **filled** | The tag reached the document and the network chose not to serve this visitor, or this page's formats are off for the zone | Check the zone's format settings in the Monetag dashboard, and its country breakdown. |
| An overlay appears but paints blank | A subresource was blocked, or the zone has no creative for that format | Compare against the policy in §7. |
| Ads appear on desktop and not on a phone (or the reverse) | Format size or a dashboard device rule | Adjust the format in the Monetag dashboard. |
| Nothing at all, everywhere | `NEXT_PUBLIC_ADS_ENABLED=false`, the tag switched off, or the provider set to `adsense`/`none` | §1. |

### The report that answers this without devtools

Each page view reports whether the tag reached the document — `lib/monetag.ts`
sends `filled`, `blocked` or `empty` to `POST /api/ads/fill`, and the API stores
one counter per country, position and outcome per day in Redis (30-day expiry,
no visitor records). `/admin` → **Overview** shows the totals, and the *Ad fill*
panel breaks them down by country and by outcome. The reading happens after
`NEXT_PUBLIC_ADS_FILL_WINDOW_MS`, not immediately, because a blocked tag fails
*after* insertion — a same-tick read would call every blocked session a fill,
which is the one distinction the report exists to make.

Read it like this:

- **Filled** everywhere except one country → inventory, on the network's side.
- **Blocked** climbing → visitors' networks and blockers, not the zones.
- **Filled but no ad** for one visitor → the zone's formats or the network's
  frequency cap for that visitor.
- **Nothing at all** → the report is off, or ads are off.

It is a diagnosis, never a gate: no ad is enabled, disabled or replaced because
of what the counters say, and turning `NEXT_PUBLIC_ADS_FILL_REPORT` off stops the
reporting entirely.

### The check that settles it: `/admin` → Ad network reachability

*Ad network reachability* asks the only question that separates the cases above:
what does the ad host do with a request from **this browser, on this connection**?
It fetches the configured tag URL and reports four outcomes — `ok` (served, with
the byte count), `error` (answered with a non-2xx status), `opaque` (answered with
something unreadable) and `silent` (nothing came back at all). Because it reads
the real status, "served" and "refused" are different answers rather than one
opaque "something answered". Run it once normally and once with a VPN; the
difference between the two runs is the diagnosis. It renders nothing and requests
no creative, and it stores the reading (`ads:probe:last`) because the session that
produced it cannot be reproduced later.

Read the two signals together: the reachability check reports what the **host**
did with the request, the Ad fill table reports what the **page** had afterwards.
`Served` next to `blocked` means the tag was delivered and something refused to
execute it — an extension that allows fetches but blocks scripts, or a policy
rejection — while `Refused` next to `blocked` means the network turned the address
away before any of that.

### A VPN is not a test of another country's ad demand

Ad networks filter datacenter and VPN IP ranges as invalid traffic, and monetised
traffic does not come from VPNs. So a VPN often shows *no* ads at all, in every
country, even when that country's visitors are served normally. Many VPNs also
ship an ad/tracker blocker that sinks the ad domains at DNS level, which shows up
as **blocked** in the report rather than **filled**. The signals that matter are
the report above and the network's own country breakdown, not a VPN.

To actually put advertising in front of VPN and datacenter visitors, the lever is
the second network: AdSense serves sessions a popunder-style network declines.
Paste the slot ids in `/admin` (§2) and those sessions get AdSense where Monetag
gives them nothing.
