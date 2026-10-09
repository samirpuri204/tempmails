# Startup readiness audit — TempMails

Audit and implementation record for the credibility, transparency and
verification-readiness work on `https://tempmails.live`, prepared for review by
programs such as Anthropic Claude Startups.

This document states what was changed, what was verified against the running
code, what was **not** changed because it cannot be evidenced, and exactly what
the operator must run to publish the result.

---

## 1. Method

Everything below was checked against the actual source, configuration and
observed service behaviour — not against the previous website copy.

| Evidence source | What it established |
| --- | --- |
| `lib/content.ts` | The editorial and policy pages are code-owned copy, mirrored into the `SeoPage` table |
| `lib/public-api.ts` | Inbox creation, extension, sending, attachments, abuse reporting — the real feature set |
| `lib/settings.ts` | Every operator-controlled default, including retention, maximum lifetime and sending |
| `lib/outbound.ts`, `lib/mail.ts` | Sending is a real, provider-backed pipeline, not a stub |
| `lib/maintenance.ts` | What the cleanup job actually deletes, and when |
| `GET https://tempmails.live/api/config` | Live configuration: `sending.enabled=true`, `retentionMinutes=60`, domain `tempmails.live` |
| `next.config.ts`, `lib/seo-urls.ts`, `app/robots.ts` | Canonical hosts, redirects, security headers, crawl policy |
| Rendered `/about`, `/contact`, `/privacy`, `/terms`, `/how-it-works` | What the public actually reads, including stored rows |

A **verified business identity** was required before any factual claim could be
published. Nothing in this work was inferred from a domain suffix, an email
address or a brand name.

---

## 2. Confirmed identity (single source of truth)

Published only after confirmation by the operator:

| Fact | Value |
| --- | --- |
| Product | TempMails |
| Official website | `https://tempmails.live` |
| Operator | Samir Giri — Founder & Operator |
| Operating location | India |
| Launched | August 2026 |
| Product category | Software & SaaS |
| Business contact | `founder@tempmails.live` |
| Structure | Independent organisation operated by its founder |

These values now live in `lib/brand.ts` and are consumed by the About page, the
Company page, the footer, the contact block and every JSON-LD entity, so the
pages cannot drift apart. No registration number, investment, parent brand,
postal address or platform endorsement is published, because none was
evidenced.

---

## 3. Content inconsistencies found and corrected

This was the highest-value part of the audit: the site contradicted its own
product in several places, including on pages a reviewer would read first.

| Claim on the site (before) | Reality in the code | Action |
| --- | --- | --- |
| "no individual extension is possible" — About FAQ | `POST /api/inbox/extend` exists in `lib/public-api.ts`; the inbox UI has an **Extend time** control; `maxLifetimeMinutes` caps the total | Copy corrected to describe extension, its cap, and that the on-page countdown is authoritative |
| "**Extend or reopen an inbox**" listed under *What we cannot do* — Contact | Same endpoint — extension works while the inbox is active | Re-worded: an **expired** inbox is never reopened; an active one can be extended, up to the configured maximum |
| "There is no archive, no recovery, and no extension" — FAQ | Extension is live | Corrected |
| "there is no recovery of expired mail and no extension" — How it works | Extension is live | Rewritten to name the real mechanism |
| "run by a small independent team" (About), "run by a small team" (Contact), "the same small team" (About FAQ), "the moderation team" / "Moderators" (Acceptable use) | One operator; no team, no moderation rota, no support desk exists | All replaced with the operator, named |
| `/contact` displayed `the retired personal address` as the operator contact | Business identity is `founder@tempmails.live` | Page copy and the stored setting now both use the business address |
| Homepage footer linked only Privacy, Terms, Acceptable use, Blog | About and Contact existed but were not reachable from the homepage footer | About, Company, Contact and AI roadmap added to the footer |
| `Organization` structured data carried no founder, founding date, country or email | Verified facts are now available | Structured data enriched (§6) |
| No company-summary page, no roadmap page | — | `/company` and `/ai-roadmap` added |
| `[slug]` catch-all could serve `/company` and `/ai-roadmap` while treating them as editorial Articles | They are product pages, not bylined guides | Registered as web pages: `WebPage`/`AboutPage` typing and no author byline |

Verified as **already accurate** and left alone:

- **Sending is real.** `GET /api/config` reports `sending.enabled=true`, and
  `lib/outbound.ts` implements delivery with rate limits, blocklists, a branded
  disclosure footer and per-message accounting. The site's conditional wording
  ("available only when enabled by the operator") is correct.
- **Deletion after expiry is real.** `cleanup()` deletes expired inboxes, which
  cascades to messages, attachments and access tokens, exactly as the privacy
  policy states. One-way address tombstones survive, and the policy says so.
- **Attachments are operator-controlled.** `settings.attachments` defaults to
  `false`; the copy does not promise them.

---

## 4. What was implemented

### About page (`/about`)

Rewritten around the questions a reviewer actually asks, in this order: what
the product is, **who operates it and from where**, when it launched, what the
mission is, **what runs in production today** (a status table, every row
labelled *Live* or *Planned*), how a temporary inbox behaves, what the service
is not for, how it is funded, what is being built next, how the guides are
written, and how to reach the operator.

The **Founder & Operator** section names an accountable person, the operating
country and the launch date, and states explicitly that there is no support
department or legal team behind the service — the opposite of inventing a team.

### Contact page (`/contact`)

Rebuilt with four clearly distinguished sections, each stating what belongs in
it and what to include:

1. Business and partnership enquiries
2. Technical support
3. Security and abuse reports
4. Privacy requests

It names the single monitored mailbox (`founder@tempmails.live`), and it
corrects the previous "extend or reopen" contradiction.

### Contact form (new)

`POST /api/contact`, with a client form on `/contact`:

- **Server-side validation** — a strict Zod schema (`lib/contact.ts`) with a
  fixed category enum, an address check, and length limits on every field.
- **Spam protection** — a per-IP rate limit (5/hour) reusing the existing Redis
  limiter, a honeypot field that answers as if delivered, and a Cloudflare
  Turnstile challenge bound to a dedicated `contact` action so a token minted
  by the inbox flow cannot be replayed here.
- **Secure delivery** — sent through the deployment's existing provider
  (Resend, then SMTP), with the visitor's address used only as `Reply-To`.
- **Clear states** — idle, sending, sent, and a specific failure message per
  error code; when no provider is configured the form says so and points at the
  mailbox instead of silently losing the message.
- **Nothing is stored.** No database row is written, which keeps the privacy
  policy's promise literally true rather than aspirational.

#### Defect found by the first real submission (fixed)

Every command-line test passed while the form was **broken for real users**.
Cloudflare Turnstile renders its own hidden input *inside* the form element, so
a browser submission carries `cf-turnstile-response` in addition to the token
field. The strict Zod schema treated that as an unknown field and returned
`400 INVALID_INPUT`. The bug was invisible to `curl` (which supplies exactly the
schema's fields by construction) and visible only to a browser.

Fixed in two places, because either alone would be fragile:

1. `components/contact-form.tsx` now collects fields **by name** instead of
   spreading the whole `FormData`, so the client sends exactly the server's
   contract and nothing the DOM happens to contain.
2. `lib/contact.ts` explicitly allows `cf-turnstile-response`, and
   `lib/public-api.ts` accepts the token from either field, so a native
   (non-JavaScript) post would also work.

Locked down by five regression tests in `tests/unit.test.ts` under
"contact form schema", the first of which asserts that the payload a real
browser posts — widget field included — parses successfully.

### Legal and policy pages

- **Privacy** — now names the operator and identifies them as the data
  controller, and adds two sections: *Contact form submissions* (what the form
  processes, that nothing is stored, and the Turnstile disclosure) and
  *Artificial-intelligence features* (no message is sent to an AI provider
  today; the conditions any future feature must meet).
- **Terms** — adds *Operator and governing law* (operator named, laws of India,
  no exclusion of non-waivable consumer rights) and a *Changes to the operator*
  clause requiring the new operator to be named before a transfer takes effect.
- **Acceptable use** — "moderation team" / "Moderators" replaced with the
  operator. The policy otherwise already described the service accurately.

No template instruction, placeholder, or unresolved contradiction remains in
those pages. No legal registration, privacy guarantee or factual claim was
invented.

### Company information (`/company`, new)

A single verification-friendly summary, rendered from `lib/brand.ts` rather
than retyped: product name, official website, operator, operating location,
launch date, product category, business contact, development status and a
statement that no third-party profiles are published. It also states what is
**deliberately withheld** (postal address, identity documents, registration
identifiers) and why, and points at what can be verified from outside: the
service works, the policies are specific, the identity is consistent, the
mailbox is monitored, and planned work is labelled as planned.

The same block renders in compact form on `/about`.

### AI development roadmap (`/ai-roadmap`, new)

Separates **live**, **in development** and **planned** capabilities in a status
table, then describes the four intended features (categorisation, spam and
phishing detection, summarisation, privacy-conscious inbox management) in
evaluation order.

The Claude API is named only as the provider the operator *intends to evaluate
first*, with ordinary engineering reasons attached (long context, published
handling terms) and an explicit statement that this is **not** a partnership,
approval, sponsorship or endorsement, and that no integration exists. The page
carries seven conditions — per-inbox opt-in off by default, purpose limitation,
minimum disclosure, named providers in the policy, no training, expiry still
deletes, and a correction route — and states that a feature does not ship until
all of them hold. It also corrects the word "intelligent" where the site's own
abuse controls are concerned: those are deterministic rules, not a model.

`/roadmap` 308-redirects to `/ai-roadmap`.

### Homepage

The inbox interface, features and layout are untouched. What changed is
credibility scaffolding: About, Company, Contact and AI roadmap are now linked
from the footer alongside the policies, and the Organization structured data
carries the verified identity. No testimonials, usage statistics, badges or
security claims were added, because none could be evidenced.

The operator block above the footer now names the person and the country and
links to the company summary, so the identity is reachable from the page a
visitor actually lands on.

#### Defect found in production (fixed)

The first version of that block placed two anchors side by side with no
separator. Because `.homepage-contact > a` was styled `display: inline-block`,
production served:

```html
<a href="mailto:founder@tempmails.live">founder@tempmails.live</a><a href="/company">Company information</a>
```

which renders as the single run-on string `founder@tempmails.liveCompany
information`. Each item is now its own paragraph, the CSS selectors were changed
from direct-child to descendant so the link styling still applies, and the live
page was re-fetched to confirm the rendered markup.

### Footer and navigation

`components/inbox.tsx` footer now lists About, Company, Contact, AI roadmap,
Blog, Privacy, Terms and Acceptable use. New labels were added to both locale
dictionaries (`locales/en.json`, `locales/ne.json`) so the bilingual homepage
stays consistent.

---

## 5. Technical SEO and public verifiability

| Item | State |
| --- | --- |
| Page titles and descriptions | Per page, from content; `pageTitle()` avoids duplicating the brand |
| Canonical URLs | Every page emits one, built from `siteOrigin()` — one host, HTTPS, no trailing slash |
| XML sitemap | `/sitemap.xml` generated from the static registry plus published rows; new pages are included automatically |
| `robots.txt` | Serves `allow /` and disallows only the five reserved application segments; advertises exactly one sitemap |
| Staging protection | Non-production deployments carry `X-Robots-Tag: noindex, nofollow` |
| Organization structured data | Now carries name, URL, description, `foundingDate`, `founder` (Person with job title), `email`, country, and a `ContactPoint` — all verified values, no `sameAs` unless real profiles exist |
| Breadcrumbs | `BreadcrumbList` mirrors the visible trail |
| HTTPS and security headers | HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, a permissions policy, and a nonce-based CSP — unchanged |
| Login-free access | Company, legal and policy pages are fully readable without an account |
| Mobile and accessibility | New markup uses definition lists, fieldsets, real labels and `aria-live` status regions; `role="alert"` on errors; focus-visible outlines on every new control |

---

## 6. Preserved infrastructure

No product behaviour was modified to fit a claim — the copy was brought in line
with the product instead. Specifically untouched: address generation, inbound
delivery, inbox isolation, recovery tokens, expiry and extension, the Prisma
schema and migrations, existing API endpoints (one was added), rate limiting,
captcha, blocklists, attachment handling, the admin console, and the advertising
integrations. The only new API route is `POST /api/contact`; no existing
endpoint changed its contract.

---

## 7. Files

**Added**

- `lib/brand.ts` — verified operator facts, one source of truth
- `lib/company-schema.ts` — Organization + Person JSON-LD built from those facts
- `lib/contact.ts` — contact form schema, delivery and recipient resolution
- `components/company-info.tsx` — company summary block (`full` / `compact`)
- `components/contact-form.tsx` — client form with states and Turnstile
- `components/repository-callout.tsx` — highlighted public-source panel and inline link, driven by `lib/brand.ts`
- `LICENSE` — MIT
- `scripts/set-site-identity.mjs` — guarded operator script for the stored site name and contact address
- `docs/STARTUP-READINESS-AUDIT.md` — this report

**Modified**

- `lib/content.ts` — About and Contact rewritten; Company and AI roadmap added; six consistency corrections applied
- `lib/content-registry.ts` — new pages registered, links and web-page slugs
- `lib/page-schema.ts` — `/company` typed as `AboutPage`
- `lib/public-api.ts` — `POST /api/contact` added
- `lib/seo.ts`, `app/page.tsx` — homepage Organization graph now uses the shared brand schema
- `app/[slug]/page.tsx` — renders the company summary, the contact form, and the Organization `@graph` on About and Company
- `components/content-shell.tsx` — unchanged behaviour; new pages flow through the shared shell
- `components/content-body.tsx` — `mailto:` links accepted in content (strict address-only pattern)
- `components/inbox.tsx` — footer navigation
- `locales/en.json`, `locales/ne.json` — footer labels
- `app/globals.css` — styles for the company block and the contact form
- `next.config.ts` — `/roadmap` → `/ai-roadmap`
- `package.json` — `contact:set` script
- `.env.example` — documents `CONTACT_FROM`

---

## 8. Deployment

**Performed 9 October 2026.** The code is live on production and the two
database writes have been applied. Recorded evidence:

| Step | Result |
| --- | --- |
| `vercel deploy --prod` | Exit 0; deployment `tempmails-qilt8vhs5-samirs-projects-95a2c475.vercel.app`; **aliased to `https://tempmails.live`**; 12 static pages generated |
| Content sync (`--apply`) | `changedPages: 19`, `changedPosts: 10`, `announcementCleared: true`, `unrelatedSettingsPreserved: true`; backup `.private-content-backups/content-1791577263441.json` |
| Contact address (`--apply`) | `contactEmailBefore: the retired personal address` → `contactEmailAfter: founder@tempmails.live`; unrelated settings preserved; backup `.private-content-backups/contact-email-1791577292082.json` |
| Deployment 2 — contact-form fix | Exit 0; deployment `tempmails-4jvu7ll5w-…` |
| Deployment 3 — identity and homepage fix | Exit 0; deployment `tempmails-1wul69asx-…` |
| Site name (`--apply`) | `name: "Temp Mail"` → `"TempMails"`; unrelated settings preserved; backup `.private-content-backups/site-identity-1791577888671.json` |

Two defects were found and fixed **after** the first deploy, both recorded in
§4: a strict-schema rejection of Turnstile's own form field, and two inline
anchors in the homepage footer aside that rendered as the single run-on string
`founder@tempmails.liveCompany information`.

Note that the deploy uploaded the **whole working tree**, which at that moment
contained 91 modified or new files — the credibility work described here *plus*
pre-existing in-flight work (advertising reinstatement, editorial/GEO tooling,
`proxy.ts`, `lib/settings.ts`, `prisma/schema.prisma`). Secrets were not
uploaded: `.vercelignore` excludes `.env*`, `.vercel`, `.private-content-backups`,
`geo/` and `worker/`.

Reverting is a matter of promoting the previous deployment
(`vercel rollback`) and restoring either backup.

The steps below are retained as the reproduction recipe.

Two gates must both be satisfied for the new copy to be visible, and neither can
be skipped.

### 8.1 Publish, then sync the stored pages

The public policy and marketing pages are served **from the `SeoPage` table**
when a row exists, falling back to `lib/content.ts` only when it does not.
Deploying the code alone is therefore not enough — the stored rows must be
upserted:

```bash
# 1. Review the plan (read-only)
npm run content:sync

# 2. Apply it, creating a private backup first
node --env-file=.env.production.local --import tsx scripts/sync-content.ts \
  --expect-origin=https://tempmails.live --apply
```

The script refuses to run against any origin other than
`https://tempmails.live`, writes a mode-0600 backup into
`.private-content-backups/`, aborts if the content changed after the backup,
and verifies afterwards that unrelated settings were preserved.

### 8.2 Set the business contact address and the site name

The address shown on `/contact`, the contact form's destination, and the
operating name used by the wordmark, the footer, `og:site_name` and every
JSON-LD entity all come from the stored `site` settings row. Both are set by one
script:

```bash
# Show the current values (read-only)
npm run site:set -- --name=TempMails --contact-email=founder@tempmails.live

# Apply
node --env-file=.env.production.local scripts/set-site-identity.mjs \
  --name=TempMails --contact-email=founder@tempmails.live \
  --expect-origin=https://tempmails.live --apply
```

The same values can be set in `/admin → Settings`; the script exists because it
validates against the application's own limits, backs up, verifies and refuses
to run against the wrong origin.

### 8.2.1 Publication to GitHub

A curated snapshot of the project — the application source, the nine
operational documents and this audit — is published at
**https://github.com/samirpuri204/tempmails** (public, MIT licensed, 130 files,
1.5 MB, default branch `main`, homepage set to the live site).

The snapshot deliberately excludes: all environment files (only `.env.example`
is included), the private content backups, the internal advertising and
outreach working directories, `node_modules`, and the internal operations log.
A repository-wide scan for credential patterns was run before publishing and
returned only documentation placeholders.

Two identity corrections were applied immediately before publication, because
publishing is the point at which a wrong identity becomes indexed and hard to
recall:

- the operator's published name was corrected everywhere it appeared — the
  brand record, the page copy, the README and this document;
- the retired personal domain was removed from all documentation, including
  where it had appeared as historical evidence.

The commit is authored as **Samir Giri \<founder@tempmails.live\>**, so the
repository itself carries the same identity the site publishes. Note that the
GitHub **account** name is a separate matter and can only be changed in GitHub's
own account settings.

### 8.2.2 Open-sourcing the source

The repository is published under the **MIT licence** (`LICENSE`, copyright
Samir Giri), and the site now points at it from three places rather than hiding
it in a footer:

| Surface | Treatment |
| --- | --- |
| Homepage | Highlighted inline link in the operator block above the footer |
| `/company` | A standing panel, plus **Source code** and **Licence** rows in the company facts, plus the repository in the Organization's `sameAs` |
| `/ai-roadmap` | A standing panel, worded to make the point that a roadmap is cheap and the code is checkable |
| Structured data | A `SoftwareSourceCode` node with `codeRepository` and `license`, alongside the Organization and founder nodes |

All of it is driven by `BRAND.repository` and `BRAND.license` in
`lib/brand.ts`, so a stale URL or a licence the project does not actually grant
cannot be advertised on one page and contradicted on another.

Two consequences the operator should be aware of, both stated in the README
rather than left implicit:

1. **MIT is permissive by design.** Anyone may run this software as their own
   service under a different name, including commercially. That is the intent of
   open-sourcing it.
2. **The licence covers the software, not the service or the marks.** It grants
   no right to the TempMails name, to the `tempmails.live` domain, or to the
   operated instance.

### 8.3 Contact form delivery

The form needs a working provider **and** a sender address the provider has
verified for the site's own domain:

- `RESEND_API_KEY` (or `SMTP_URL`) must be set — the deployment already has one,
  since anonymous sending is live;
- `CONTACT_FROM` should be set to a verified sender such as
  `contact@tempmails.live`, or left unset to fall back to `ALERT_FROM` and then
  `contact@$EMAIL_DOMAIN`;
- the Turnstile site key and secret must be present (they already are, since
  the homepage uses Turnstile), and the widget is created with the `contact`
  action the server verifies.

If none of that is configured the form reports itself unavailable and points at
the mailbox — it never claims to have sent something.

### 8.4 Post-deploy verification

```bash
for p in / /about /company /contact /privacy /terms /acceptable-use /ai-roadmap /roadmap /blog /faq; do
  curl -sS -o /dev/null -w "%{http_code} %{redirect_url} $p\n" "https://tempmails.live$p"
done
curl -sS https://tempmails.live/api/config
curl -sS https://tempmails.live/sitemap.xml | head -40
curl -sS https://tempmails.live/robots.txt
```

Then confirm: `/company` and `/ai-roadmap` appear in the sitemap; `/about` shows
the Founder & Operator section; `/contact` shows the business address and the
form; the Organization JSON-LD on `/` and `/about` carries the same founder,
country, founding date and email; and one test submission to the contact form
arrives at the monitored mailbox with a working reply-to.

---

## 9. What was verified, and how

Every claim in §4 was checked by running something, not by reading the diff.

| Check | Result |
| --- | --- |
| `tsc --noEmit` (strict TypeScript, whole project) | Exit 0, no errors |
| Editorial/unit/ad test suite (`vitest run`) | See §9.1 |
| ESLint | See §9.1 |
| Production build (`next build`) | See §9.1 |
| Consistency scan over all 19 published pages | All rules pass — see below |
| Sitemap and registry wiring | `/company` and `/ai-roadmap` present (21 URLs); no reserved application path leaked; no duplicated slashes |
| Internal link integrity | Every link in `contentLinks` resolves to a real page |
| Structured-data typing | `about`/`company` → `AboutPage`, `contact` → `ContactPage`, site pages → `WebPage`, guides → `Article`; each carries `FAQPage` only when visible questions exist |
| Organization entity | `foundingDate=2026-08`, `email=founder@tempmails.live`, `addressCountry=IN`, `founder` → a `Person` node named "Samir Giri — Founder & Operator"; `sameAs` correctly absent |
| Markdown rendering of the new pages | Tables, lists and headings all parse; no leftover markup, no raw HTML |
| Company summary component | Renders all nine facts in both variants; the compact variant links to `/company` |
| Contact validation schema | Passes, now including the case that mattered: the payload a real browser posts, carrying Turnstile's own hidden field, is accepted (§4); unknown category, malformed address, bad message length and a genuinely unknown field are still rejected; the honeypot stays accepted |
| Live contact endpoint | `POST /api/contact` on production returned `201 {received:true}` for a honeypot submission **without sending mail**, `400 INVALID_INPUT` for an unknown category, `403 CAPTCHA_REQUIRED` for a submission with no token, and `403 INVALID_ORIGIN` for a foreign origin |
| Live inbox flow | A real inbox was issued on production (`mu2***@tempmails.live`) with a running countdown and an **Extend time** control present; no error banner, no console errors |
| Contact-email operator script | All five guards fire **before any database access** — unset `APP_URL`, wrong origin, invalid address, missing `--email`, and `--apply` without `--expect-origin` |

The consistency scan is the one worth describing, because it is what proves
requirement 7 was met rather than merely attempted. Across all 19 pages it
asserts that there is no claim that extension is impossible, no claim to a team
or moderators, no superseded contact address, no superseded operating country,
no invented AI-partnership wording, no unfilled template placeholder, no
incorporation or registration claim, and no fabricated testimonial or usage
statistic — plus that extension and sending *are* described. It also confirms
that the confirmed operator identity appears on every page that names the
operator.

### 9.1 Test-suite, lint and build results

| Command | Result |
| --- | --- |
| `vitest run` (unit + editorial + ads) | **77 passed, 1 failed** — the failure is the pre-existing ads allowlist test described below |
| `vitest run tests/unit.test.ts` (after the contact fix) | **31 passed, 0 failed** — that file grew from 26 to 31 tests with the five contact-form regression tests |
| `eslint .` | See §9.2 |
| `next build` | See §9.2 |

### 9.2 Lint and production build

**No lint verdict is claimed.** `eslint .` over the whole project was still
running when its execution window closed, and a narrower lint restricted to the
files this change set touches did not complete either. Type-checking is clean
across the whole project and the new code follows the conventions of the files
around it, but a green lint run is an operator step: `npm run lint`.

`next build` **does not run in this environment**, and the reason is
environmental rather than a defect in the change set. The build aborts while
loading the config:

```text
⚠ Attempted to load node_modules/next/next-swc-fallback/@next/swc-darwin-arm64/next-swc.darwin-arm64.node, but it was not installed
⚠ Attempted to load @next/swc-darwin-arm64, but it was not installed
⨯ Failed to load next.config.ts
Error: Cannot find module '.../lib/site-url' imported from .../next.config.compiled.js
BUILD_EXIT=1
```

Evidence that this is not caused by this work:

1. `node_modules/@next/swc-darwin-arm64/` contains only `README.md` and
   `package.json` — the native `.node` binary is absent, so this checkout's
   dependency tree is incomplete for this platform. That is also why the test
   run reported 217 s of transform/import time: everything fell back to the
   slow path.
2. The unresolved import is `./lib/site-url` inside `next.config.ts`.
   `git show HEAD:next.config.ts` contains that exact import, and
   `lib/site-url.ts` is tracked and unmodified by this change set, so the
   failing line predates the work.
3. `next.config.ts` itself is valid and functional: `tests/editorial.test.tsx`
   imports `../next.config`, awaits `redirects()` and `headers()`, and asserts
   their rules — those assertions pass, including the ones covering the
   reserved-path headers and the language-prefix redirects.

Remedy for a local production build: reinstall dependencies so the
platform-specific Next binary is fetched (`npm ci`), then re-run `next build`.

**The production build itself is verified on Vercel**, which is the gate that
matters: `vercel deploy --prod` completed remotely with exit 0 and generated the
route table below, twice — once for the initial deployment and once for the
contact-form fix. So the new routes have been through a real Next production
compile; what has not happened is a successful compile *in this checkout*.

```text
Route (app)                       Revalidate  Expire
┌ ƒ /
├ ○ /_not-found
├ ƒ /[slug]
├ ƒ /[slug]/opengraph-image
├ ƒ /admin
├ ○ /ads.txt
├ ƒ /api/[...path]
├ ƒ /blog
├ ƒ /blog/[slug]
├ ƒ /blog/[slug]/opengraph-image
├ ○ /blog/opengraph-image
├ ○ /icon.svg
├ ○ /opengraph-image
├ ○ /robots.txt                          10m      1y
├ ○ /sitemap-index.xml
└ ○ /sitemap.xml                         10m      1y
ƒ Proxy (Middleware)
Build Completed in /vercel/output [46s]
```

The suite result is 77 passing and one failing test, and the failure is
**pre-existing and unrelated to this work**:

- Failing test: `tests/ads.test.ts` → "has no identifier left anywhere in the
  project except the permitted files".
- Reported hits: `app/globals.css`, `lib/monetag.ts`, and `.env.example` (twice).
- Cause: the advertising-reinstatement work already present in the working tree
  added those identifiers to those three files without adding them to the
  test's `PERMITTED` list. `git show HEAD:app/globals.css` and the `HEAD`
  versions of the other two files contain none of them, and this change set adds
  no such identifier anywhere (`git diff` over the files touched here shows no
  occurrence), so the failure predates this task.
- Why it was **not** fixed here: the test is an allowlist guard for a security-
  adjacent check, and widening an allowlist to turn a suite green is exactly the
  kind of change that should be made knowingly by the person who owns that
  workstream. The remedy is one line — add `app/globals.css`, `lib/monetag.ts`
  and `.env.example` to `PERMITTED` in `tests/ads.test.ts`, which is the
  maintenance step the test's own comment describes.
- Impact on deployment: none. The production build, not this suite, is the
  deploy gate.

## 10. Remaining verification gaps

Stated plainly, because a gap that is hidden is the only kind that matters:

1. **The fixed contact form has not yet delivered a real message.** The
   submission that exposed the Turnstile-field bug (§4) is the proof that the
   widget, the action name and the endpoint all work end to end — but that
   submission was rejected by the bug, and the fix has not since been confirmed
   by a completed delivery. The confirmation is one form submission on the live
   site **after** the fix deployment; see item 2 for the one obstacle.
2. **The verification traffic itself exhausted the form's rate limit.** The
   endpoint allows 5 submissions per hour per IP, and the checks below consumed
   that budget from this connection, so a re-test from here returns
   `TOO_MANY_REQUESTS` until the window rolls over. Submit once from a different
   connection, or wait an hour, and expect the "Message sent" panel with the
   message arriving at `founder@tempmails.live`.
3. **The Turnstile `contact` action is confirmed required but not confirmed
   passing.** Production returned `403 CAPTCHA_REQUIRED` without a token, which
   proves the action is enforced, and the browser run showed the widget
   resolving and enabling the submit button — but no submission has yet carried
   a verified token through to delivery.
4. ~~**`settings.name` is "Temp Mail", while the company summary publishes the
   product name as "TempMails".**~~ **Resolved.** The stored name was changed to
   "TempMails", so the wordmark, footer, `og:site_name`, `Organization.name`,
   `WebSite.name` and `SoftwareApplication.name` all agree with `/company`. The
   remaining "Temp Mail" strings in the HTML are the keyword-led SEO **title**
   (`Temp Mail — Free Temporary Email Inbox | TempMails`) and the deliberate
   `alternateName: ["Temp Mails"]` alias — neither is the company name, and the
   title was left alone because changing it is an SEO decision, not a
   consistency fix.
5. **The deploy shipped the whole working tree**, including pre-existing
   in-flight work beyond this change set (§8). The credibility changes are
   verified; the other 70-odd files' behaviour was not audited here.
6. **The founder identity was not checked against an external public source.**
   It was confirmed by the operator. No third-party profile (LinkedIn, GitHub,
   X, a company register) was supplied, so none is published and `sameAs` stays
   empty. A reviewer looking for a second source will not find one yet.
7. **No manual screen-reader pass was performed.** Automated checks pass and the
   new markup follows accessible patterns, but that is not the same as testing
   with a screen reader, and it is not claimed to be.
8. **No Lighthouse/Core Web Vitals run was recorded for the new pages.** They
   reuse existing components and add no new third-party script beyond the
   Turnstile loader already used on the homepage.
9. **The production build succeeds on Vercel but not in this checkout**
   (§9.2). The remote build completed twice with exit 0 and generated 12 static
   pages, which is the gate that matters — but a local `next build` still fails
   here because this `node_modules` is missing the platform-specific Next
   binary. Run `npm ci` before relying on a local build.
10. **Whole-project ESLint produced no verdict here.** Both the repository-wide
    run and a narrower run over the changed files were still executing when
    their windows closed. `npm run lint` remains worth running once locally;
    `tsc --noEmit` is clean across the whole project.
11. **`tests/ads.test.ts` still reports one failure** for the reasons in §9.1 —
    pre-existing, unrelated, and unfixed by design.

---

## 11. Information still required from the operator

Each item below is published **nowhere** until it is supplied. The site is
correct without it; it is listed so the gap is visible rather than filled in.

| Item | Status | Why it is not published |
| --- | --- | --- |
| Registered entity name and registration number | Answered as "Organization"; no identifier supplied | Publishing "Organization" as a registration status would imply a registration that cannot be evidenced. Give the registered name and number and it can be added to `/company` |
| Exact launch date | Given as `2026-08` | Month precision was used deliberately; an exact day would need confirmation |
| Third-party professional profiles | None supplied (the answer given was the website itself) | Only genuinely operator-owned profiles belong in the footer and in `sameAs` |
| Postal or legal service address | Not supplied | Withheld by design; a registered address for legal service is the operator's decision |
| Whether `founder@tempmails.live` will stay monitored | Confirmed as working | The privacy policy promises the mailbox is read; that is an ongoing operational commitment |
| Governing law | India, chosen from the confirmed operating country | Should be confirmed with a legal adviser, not assumed |
| Product-name spelling | **Resolved** — the stored name now reads "TempMails" | One decision remains open: the SEO **title** still leads with "Temp Mail". It was left as-is because it is a keyword choice rather than the company name, and both spellings already appear in it. Say the word if it should lead with "TempMails" |

---

## 12. Items flagged for legal review

These are genuine compliance questions this audit could not resolve from the
codebase, and they are flagged rather than answered:

1. **Cookie and tracking consent.** Public pages load third-party advertising
   and a Turnstile challenge. If the service is offered to visitors in the EU or
   the UK, prior consent for non-essential storage is likely required, and the
   current implementation does not gate ad scripts behind a consent banner.
   This needs a legal determination, not a code guess.
2. **Governing law and consumer rights.** The terms now state the laws of India
   and preserve non-waivable consumer rights. Whether that clause is enforceable
   against consumers in the operator's target markets should be reviewed.
3. **Data-protection roles and transfers.** The privacy policy names the
   infrastructure providers and states that message contents are not used for
   advertising or profiling. Whether a data-processing agreement is in place
   with each provider, and whether a UK/EU representative is required, should be
   confirmed.
4. **Age and eligibility.** The terms do not state a minimum age. If the service
   is offered to minors in any target jurisdiction, that may need to be
   addressed.
5. **Tax and business registration.** Independently of this website, the
   operator should confirm they meet the registration threshold in the
   operating country for a service that carries advertising revenue.

---

## 13. Rollback

Everything in this change set is additive or copy-level, and every write made by
the deployment scripts is reversible:

- **Content** — `.private-content-backups/content-<timestamp>.json` holds the
  complete pre-sync state of the `SeoPage`, `BlogPost` and settings rows.
- **Contact address** — `.private-content-backups/contact-email-<timestamp>.json`
  holds the previous settings row.

Restoring either is a matter of writing the backed-up row back, which is a
deliberate manual step so a rollback cannot happen by accident.
