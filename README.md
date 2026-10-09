# TempMails

Private, expiring email inboxes for **https://tempmails.live** — no registration, no account, a visible countdown, and a documented set of limits.

A temporary address is issued in seconds so a verification code, a download link or a one-off notification can land somewhere disposable instead of in a mailbox you intend to keep. Every inbox is bound to the browser that created it, carries a recovery token for another device, and stops accepting mail when its countdown reaches zero.

This repository is the real application — the receiving pipeline, the inbox, the admin console and the public site — not a mock with seeded fixtures.

---

## The product, and who operates it

Everything below is the confirmed public identity of the service. It is stated here because a reader assessing this project should be able to check who is behind it.

| | |
| --- | --- |
| Product | **TempMails** |
| Official website | https://tempmails.live |
| Operator | **Samir Giri** — Founder & Operator |
| Operating location | India |
| Launched | August 2026 |
| Product category | Software & SaaS |
| Business contact | [founder@tempmails.live](mailto:founder@tempmails.live) |

TempMails is an **independent service operated by its founder**. There is no parent brand, no investment, no platform endorsement and no support department behind it: one operator writes the code, runs the infrastructure, answers the mailbox and is accountable for every policy published on the site.

No company-registration identifier, postal address or identity document is published, because none is needed to contact the operator or to assess the service. The site therefore makes **no incorporation, funding or endorsement claim**, and it does not describe itself as powered by any AI provider.

The same identity is rendered from one source of truth — [`lib/brand.ts`](lib/brand.ts) — into the About page, the Company page, the footer, the contact block and the JSON-LD, so the pages cannot drift apart.

---

## What the service does

Live in production:

- **Account-free inboxes.** An address is generated on demand and shown immediately; nothing is registered and nothing is reserved.
- **Private access by cookie, plus a recovery token.** The recovery token is the only way to reopen the same inbox from another device.
- **Visible expiry countdown with extension.** A single `Extend time` control adds the configured starting duration while the inbox is still running, capped at an operator-configured maximum lifetime. The countdown on the page is authoritative.
- **Plain-text outbound sending.** Rate-limited per inbox, per device and per day, subject to blocklists and abuse checks, with a disclosure footer. Operator-controlled.
- **Sanitized message rendering.** Formatted messages are rendered through a deliberately limited, safe renderer; remote images are blocked by default.
- **Attachment delivery.** Operator-controlled and disabled unless explicitly enabled.
- **Abuse reporting and enforcement.** Recipients can report a message; the operator can block senders, suspend inboxes and shut down domains.
- **Public site.** Content pages, a blog, legal and policy pages, an AI roadmap, sitemap and robots generated from the application itself.
- **Display advertising** on public pages through third-party networks, which is how the service is funded.

Deliberately **not** offered: accounts, permanent storage, message recovery after expiry, email forwarding, sending from a chosen custom address, or any promise that a third-party site will accept a disposable domain.

---

## How it works

```text
Sender ──▶ Cloudflare Email Routing
                 │
                 ▼
        Cloudflare Email Worker  ──▶  Queue (durable, with dead-letter)
                 │                         │
                 │ signed HTTPS            ▼
                 └──────────────▶  Next.js API  ──▶  PostgreSQL (Prisma)
                                        │                    │
                                        │                    └─▶ cleanup job removes
                                        ▼                        expired inboxes,
                                   Redis / KV                       cascading to messages,
                                (limits, sessions,                  attachments, tokens
                                 revision counter)
                                        │
                    Browser ◀── SSE ────┘   live inbox updates, no polling
```

- **Inbound.** The worker authenticates to the app with a shared secret and hands the message to a provider-neutral ingestion layer that applies the domain rules, the size policy and the MIME policy before anything is stored.
- **Delivery to the browser.** A revision counter in Redis lets the inbox stream new messages over SSE, so a message appears without the page polling.
- **Expiry.** A scheduled cleanup job deletes expired inboxes; the database cascades that to messages, attachments and access tokens. One-way address tombstones remain so an address cannot be silently reissued, and they hold no message content.
- **Rendering.** Content pages, canonical URLs, JSON-LD, the sitemap and `robots.txt` are produced by the application from a registry rather than hand-maintained, so a page cannot ship without metadata.

---

## Stack

| Layer | Choice |
| --- | --- |
| Application | Next.js (App Router), React, TypeScript in strict mode |
| Styling | Tailwind CSS v4 plus a small amount of hand-written CSS for components |
| Database | PostgreSQL via Prisma, versioned migrations |
| Cache / coordination | Redis (Upstash-compatible) for rate limits, sessions and revision counters |
| Inbound mail | Cloudflare Email Routing + Email Worker + Queues, spooled in R2 |
| Outbound mail | Provider-agnostic: Resend HTTP API, or SMTP (`nodemailer`) |
| Abuse protection | Cloudflare Turnstile, per-IP rate limits, blocklists |
| Hosting | Vercel (application), Cloudflare (mail edge) |
| Testing | Vitest (unit, editorial, ads and integration) |

---

## Repository layout

```text
tempmails/
├── app/
│   ├── api/[...path]/route.ts       # Single API dispatcher: public, admin, inbound, health, cron
│   ├── admin/page.tsx               # Admin entry; never indexed
│   ├── [slug]/page.tsx              # SSR content, legal and help pages
│   ├── [slug]/opengraph-image.tsx
│   ├── blog/page.tsx                # Journal hub
│   ├── blog/[slug]/page.tsx         # Guides
│   ├── page.tsx                     # Private inbox / homepage
│   ├── layout.tsx                   # Metadata, CSP-driven ad origins
│   ├── globals.css
│   ├── robots.ts
│   ├── sitemap.xml/route.ts         # Generated sitemap
│   ├── sitemap-index.xml/route.ts
│   ├── ads.txt/route.ts
│   ├── not-found.tsx, error.tsx
│   └── icon.svg, opengraph-image.tsx
├── components/
│   ├── inbox.tsx                    # Live inbox, recovery, CAPTCHA, message reader
│   ├── admin.tsx                    # Role-aware operations and editing forms
│   ├── content-shell.tsx            # Content page chrome and navigation
│   ├── content-body.tsx             # Intentionally limited, safe Markdown renderer
│   ├── company-info.tsx             # Company summary block (about + company pages)
│   ├── contact-form.tsx             # Public contact form (client validation + Turnstile)
│   ├── home-seo.tsx                 # Homepage editorial sections
│   ├── adsense-slot.tsx
│   └── ads/                         # Ad components and placement control
├── lib/
│   ├── brand.ts                     # Verified operator identity — single source of truth
│   ├── company-schema.ts            # Organization + founder JSON-LD
│   ├── contact.ts                   # Contact form schema and delivery
│   ├── content.ts                   # Public page and guide copy (code-owned seed)
│   ├── content-registry.ts          # Page registry: links, web-page slugs
│   ├── content-data.ts              # Page resolution (stored row, else static copy)
│   ├── page-schema.ts               # Per-page JSON-LD
│   ├── seo.ts, seo-urls.ts          # Shared titles, canonical URLs, robots rules
│   ├── site-url.ts, sitemap-xml.ts
│   ├── settings.ts                  # Validated application settings
│   ├── http.ts                      # Validation, bounded bodies, rate limits, errors
│   ├── security.ts                  # Tokens, passwords, HMAC, encryption, sanitization
│   ├── inbox.ts                     # Inbox authorization and revision events
│   ├── public-api.ts                # Public operations, SSE, signed downloads
│   ├── admin.ts, admin-api.ts       # Roles, audit trail, admin authentication
│   ├── mail.ts                      # Provider-neutral ingestion and MIME policy
│   ├── outbound.ts                  # Sending, branded footer, delivery records
│   ├── maintenance.ts               # Cleanup, domain health, optional alerts
│   ├── editorial.ts                 # Revision dates and source handling
│   ├── editorial-publish.ts         # Publication gating
│   ├── post-schema.ts               # Guide validation
│   ├── ad-config.ts, monetag.ts     # Advertising configuration
│   ├── og-image.tsx                 # Social image generation
│   └── db.ts                        # Prisma singleton
├── locales/{en,ne}.json             # Inbox translations
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                  # Versioned SQL migrations
│   └── seed.ts
├── scripts/
│   ├── create-owner.ts              # First owner only
│   ├── sync-content.ts              # Publish code-owned copy to stored rows (guarded)
│   ├── set-site-identity.mjs        # Set the public name / contact address (guarded)
│   ├── seo-check.mjs, sitemap-check.py
│   ├── apply-seo.ts, sync-seo-titles.ts
│   └── configure-production.mjs, discover-trends.py
├── tests/
│   ├── unit.test.ts                 # Security utilities, schemas, sitemap, contact form
│   ├── editorial.test.tsx           # Content invariants, safe renderer, link integrity
│   ├── ads.test.ts                  # Advertising containment and allowlists
│   └── integration.test.ts          # Real PostgreSQL/Redis flows (isolated DB required)
├── worker/                          # Cloudflare Email Worker + queue consumer
├── content/blog/                    # Guide sources and manifest
├── docs/                            # See the documentation index below
├── proxy.ts                         # Per-request nonce CSP and private cache rules
├── next.config.ts                   # Canonical-origin redirects and security headers
├── docker-compose.yml               # PostgreSQL + Redis for local development
├── vercel.json
└── .env.example
```

---

## Local setup

Use Node 22 or 24. Install dependencies with `npm ci`.

1. Copy `.env.example` to `.env` and replace every required value. Use `APP_URL=http://localhost:3000` and `NEXT_PUBLIC_APP_URL=http://localhost:3000` locally. Generate the three secrets independently with `openssl rand -hex 32`.
2. Start PostgreSQL 16 and Redis 7+. Alternatively set `POSTGRES_PASSWORD` and run `docker compose up -d`. Keep the password in `DATABASE_URL` consistent.
3. Run `npm run db:migrate`, then `npm run db:seed`. The seed creates a **disabled** domain and editable public content, with no fabricated mail and no admin credentials.
4. Set `OWNER_EMAIL` and a unique `OWNER_PASSWORD` of at least 14 characters, then run `npm run owner:create`. Remove `OWNER_PASSWORD` afterwards.
5. Run `npm run dev`, open `http://localhost:3000/admin`, sign in, and configure the domain. Activate it only once inbound routing works — with no active domain the public inbox shows an honest service-unavailable state.
6. Configure the real receiving provider as described in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Prisma commands read `.env`. The seed and owner commands load it explicitly via Node. If you use `.env.local` instead, invoke scripts with `node --env-file=.env.local --import tsx prisma/seed.ts` and `node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy`; Next.js loads `.env.local` automatically.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Apply versioned PostgreSQL migrations |
| `npm run db:seed` | Insert initial settings, domain and public content, idempotently |
| `npm run owner:create` | First owner only; later accounts are created in the admin panel |
| `npm run lint` | ESLint |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Unit, editorial and advertising test suites |
| `npm run test:integration` | Real PostgreSQL/Redis flows; isolated database required |
| `npm run build` | Prisma generation and a production Next.js build |
| `npm start` | Production application server |
| `npm run content:sync` | Publish code-owned page and guide copy to the stored rows (read-only unless `--apply`) |
| `npm run site:set` | Set the public site name or contact address (read-only unless `--apply`) |

For integration tests create a separate database named `tempmails_test` and a separate Redis database, point `.env.test` at them, then run:

```bash
node --env-file=.env.test node_modules/vitest/vitest.mjs run tests/integration.test.ts
```

The tests refuse other database names and clear test records. Never point them at production.

## Configuration

See [`.env.example`](.env.example) for the full annotated list. The values that matter most:

| Variable | Notes |
| --- | --- |
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | The canonical origin. Every canonical URL, redirect, JSON-LD URL and sitemap entry is derived from it, so a wrong value rewrites the whole site |
| `APP_SECRET` | Signs inbox access tokens and inbound webhooks |
| `DATABASE_URL`, `REDIS_URL` / `KV_*` | PostgreSQL and Redis |
| `EMAIL_DOMAIN` | The domain that receives mail |
| `INBOUND_SECRET` | Shared secret between the mail worker and the ingestion endpoint |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Abuse protection on inbox creation, sending and the contact form |
| `RESEND_API_KEY` or `SMTP_URL` | Outbound transport; Resend wins when both are set |
| `CONTACT_FROM` | Sender for contact-form notifications; falls back to `ALERT_FROM`, then `contact@$EMAIL_DOMAIN` |
| `CRON_SECRET` | Authenticates the scheduled cleanup call |
| `TRUST_PROXY` | Must be true only behind a proxy that overwrites the client IP header |

---

## Privacy and security posture

The application is built to hold as little as possible for as short as possible, and to state its limits rather than imply guarantees.

- **Nothing about a visitor is required to receive mail.** No account, no email address, no name.
- **Expiry is a deletion, not an archive.** The cleanup job removes messages, attachments and access tokens with the inbox. Tombstones remain so addresses cannot be silently reissued; they contain no message content.
- **Personal data is deliberately thin.** Access tokens are hashed, passwords are hashed, and the audit trail records actions rather than message contents.
- **The public contact form stores nothing.** A submission is delivered as email; no database row is written. It is rate-limited, honeypot-protected and gated behind Turnstile bound to a dedicated action.
- **Only rule-based screening runs today.** Abuse control uses rate limits, blocklists and pattern matching on metadata — not machine learning, and not the meaning of a message. No message content is sent to an AI provider.
- **Security headers are enforced centrally.** HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, a permissions policy, and a nonce-based Content-Security-Policy, all applied in `proxy.ts` so a page cannot opt out.
- **Staging is never indexed.** Non-production deployments carry `X-Robots-Tag: noindex, nofollow`.
- **Editorial input is rendered safely.** Content is parsed by a deliberately limited renderer that never executes raw HTML, and link targets are filtered to safe destinations.

Read [docs/SECURITY.md](docs/SECURITY.md) for the threat model and the backup and recovery notes.

---

## Content and editorial system

Public pages and guides are **code-owned copy** stored in `lib/content.ts` and `content/blog/`, mirrored into database rows so the admin panel can edit them. `npm run sync-content` (read-only by default) publishes the code copy to the stored rows, refuses to run against any origin other than the production site, takes a private backup first, aborts if the content changed since that backup, and verifies afterwards that unrelated settings were preserved.

Guides are drafted against a defined question and checked against primary sources before publication; each carries a publication date and is revised when the underlying behaviour changes. Drafts may be prepared with AI assistance, but nothing is published until it has been checked line by line against the cited material. See [docs/EDITORIAL.md](docs/EDITORIAL.md).

---

## AI roadmap

The site publishes an honest three-way split between **live**, **in development** and **planned** capabilities at https://tempmails.live/ai-roadmap. Four features are intended for evaluation — categorisation, spam and phishing detection, summarisation, and privacy-conscious inbox management — and the Claude API is named only as the provider that would be evaluated first, for ordinary engineering reasons.

That page also states plainly that **no message content is sent to an AI provider today**, and lists the conditions any future feature must meet before it processes a real message: a per-inbox opt-in that is off by default and revocable, purpose limitation, minimum disclosure, the provider named in the privacy policy before the feature is enabled, no training on message content, unchanged retention, and a correction route for wrong output.

There is **no partnership, funding, approval or endorsement relationship with Anthropic or any other AI provider**, and this project does not claim one.

---

## Documentation index

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, ingestion and delivery model |
| [docs/API.md](docs/API.md) | The public and administrative API contract |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Infrastructure, environment and release process |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, access control, backups, recovery |
| [docs/EDITORIAL.md](docs/EDITORIAL.md) | How copy and guides are written, reviewed and corrected |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | Verification runs and their results |
| [docs/STARTUP-READINESS-AUDIT.md](docs/STARTUP-READINESS-AUDIT.md) | Transparency and verification-readiness audit: what was changed, what was verified against the running code, and what remains unproven |
| [docs/ADSENSE.md](docs/ADSENSE.md) | Advertising setup and placement policy |
| [docs/MONETIZATION.md](docs/MONETIZATION.md) | How the service is funded |

---

## Deployment

The application deploys to Vercel; the receiving pipeline runs on Cloudflare. A release is:

1. `npm run typecheck && npm test`
2. `npm run build`
3. Deploy the application.
4. `npm run content:sync` (dry run), then re-run with `--expect-origin=<origin> --apply` to publish any copy changes.
5. `npm run site:set` to publish a name or contact-address change.
6. Verify `/`, `/about`, `/company`, `/contact`, `/privacy`, `/terms`, `/acceptable-use`, `/ai-roadmap`, `/robots.txt` and `/sitemap.xml`.

[`docs/STARTUP-READINESS-AUDIT.md`](docs/STARTUP-READINESS-AUDIT.md) records a full audit trail of one such release, including the checks that were run, the defects they surfaced, and the gaps that were left open on purpose.

---

## Licence

No licence is granted. This is a proprietary product; the source is published for transparency and review, not for reuse. All rights reserved.

## Contact

Business, partnership, support, security and privacy enquiries all reach the operator through one monitored mailbox: **[founder@tempmails.live](mailto:founder@tempmails.live)**, or the form at https://tempmails.live/contact. Reports of abuse and security issues are read first.
