# Deploy tempmails.live

## 1. Provision services

- A Vercel project for this repository, with Node 22 or 24.
- PostgreSQL 16+ (for example a managed provider). Use the provider’s connection-pooling URL for runtime; apply migrations with its direct connection if required. Enable TLS using the provider’s connection parameters.
- A Redis instance with TLS and a **TCP-compatible** URL (`rediss://...`). This application uses ioredis, not a REST Redis client. Select a region close to PostgreSQL and Vercel.
- Cloudflare DNS authority for `tempmails.live`, Email Routing, a Worker, R2, and Queues.
- A Cloudflare Turnstile widget registered for `tempmails.live`.

Vercel serves HTTPS pages and APIs. It does **not** receive SMTP email or act as the domain’s MX host. See the official [Cloudflare email handler documentation](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/) and [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation).

## 2. Vercel environment

Set every required production value in Vercel Project Settings → Environment Variables. Use separate secrets and databases for Preview and Production. Do not connect preview deployments to live inbound mail.

| Variable | Required | Meaning |
|---|---|---|
| `APP_URL` | yes | Exact canonical HTTPS origin: `https://tempmails.live`; also CSRF allowlist |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin; do not place secrets in NEXT_PUBLIC variables |
| `DATABASE_URL` | yes | PostgreSQL connection string, TLS in production |
| `REDIS_URL` | yes | Dedicated Redis connection with authentication/TLS |
| `APP_SECRET` | yes | Independent 32-byte-or-longer secret for keyed hashes, attachment signatures and TOTP encryption; keep stable and backed up |
| `INBOUND_SECRET` | yes | Shared HMAC secret with the Email Worker |
| `CRON_SECRET` | yes | Bearer credential sent by the Cloudflare scheduled Worker or external scheduler |
| `EMAIL_DOMAIN` | seed | `tempmails.live`; additional domains use the admin panel |
| `OWNER_EMAIL` | bootstrap | Initial owner email, used only by creation command |
| `OWNER_PASSWORD` | bootstrap | At least 14 characters; remove after creation |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | production | Public widget key |
| `TURNSTILE_SECRET_KEY` | production | Private verification key; expected actions are `create-inbox` and `send-mail` |
| `TRUST_PROXY` | production | Set `true` on Vercel, which overwrites `x-real-ip`; otherwise configure a trusted reverse proxy before enabling |
| `MALWARE_SCAN_URL` | attachments | Operator-controlled HTTPS endpoint; receives bytes, returns `{"clean":true}` |
| `MALWARE_SCAN_SECRET` | attachments | Scanner Bearer secret; scanning must succeed before storing any attachment |
| `RESEND_API_KEY` | optional | API key for operational alerts and, when anonymous sending is enabled, external outbound mail |
| `ALERT_FROM` | with Resend | Verified sending address on your administrative mail domain |
| `ALERT_TO` | with Resend | Operations recipient; never uses a temporary address |
| `SMTP_URL` | optional | Outbound SMTP transport (`smtps://user:pass@host:465`) used when `RESEND_API_KEY` is absent; must be authorised to send for the temporary domains |
| `ERROR_MONITOR_URL` | optional | Trusted HTTPS sink for redacted error code/timestamp events |

`APP_SECRET` rotation invalidates keyed IP histories and attachment tickets and makes existing TOTP secrets unreadable. Plan a TOTP re-enrollment before rotating. Inbox/access hashes are independent of it. Rotate inbound secrets on both services in a coordinated maintenance window.

### Anonymous sending (optional)

Visitors can send short plain-text messages *from* their temporary address once **Sending enabled** is switched on in `/admin` → Settings. It ships off. Before enabling:

1. Decide the transport. Mail to another hosted temp domain is written straight into that inbox and needs no provider. External recipients need either `RESEND_API_KEY` (verify every temp domain in Resend so it signs DKIM for it) or `SMTP_URL` pointing at a relay allowed to send for those domains. Without a provider the compose dialog tells visitors that only temp-to-temp delivery is available.
2. Publish SPF and DKIM for each temp domain according to your provider's instructions, and set a DMARC policy. Sending from an unauthenticated domain will be rejected or spam-foldered and can damage the domain's reputation for inbound routing as well.
3. Review the limits in Settings: per inbox per hour, per device per day, and site-wide per day, plus the maximum message length. Keep them low; this is a convenience for replies, not a bulk channel.
4. Keep the footer text. It identifies the message as anonymous, gives the recipient the `Reference` UUID to quote in abuse reports, and states that replies only work while the inbox is active.
5. Watch the **Sent mail** admin tab and the `mail_sent` / `send_failed` / `send_blocked` metrics. Blocklist entries of kind `sender` and `domain` apply to outbound recipients too; `keyword` entries block matching outbound bodies. Suspending an inbox stops further sends from it.

Delivery status is recorded on each `OutboundMessage` row (`SENT`, `SENT_NO_MAILBOX`, `SENT_FULL`, `FAILED`); visitors only ever see `SENT`/`FAILED` so they cannot probe which temp addresses exist. Rows cascade with the sending inbox, so they disappear at cleanup like everything else.

Run `npm ci`, `npm run db:migrate`, `npm run db:seed`, and `npm run owner:create` against the production database from a trusted operator environment. **Do not put migrations or owner creation into concurrent Vercel builds.** Remove owner password variables. Deploy through the Vercel project’s normal Git integration or `vercel --prod` after linking the intended project.

Add `tempmails.live` to Vercel Domains. Publish the A/CNAME records that Vercel shows for the website. HTTPS website records and MX email records serve different purposes and can coexist. Set the canonical APP_URL consistently; redirect `www` to the canonical host at the hosting layer.

## 3. Cloudflare receiving pipeline

From `worker/`:

```sh
npm ci
npx wrangler login
npx wrangler r2 bucket create tempmails-mail-spool
npx wrangler queues create tempmails-inbound
npx wrangler queues create tempmails-failed
npx wrangler secret put INBOUND_SECRET
npx wrangler secret put CRON_SECRET
npm run deploy
```

Enter exactly the same inbound secret as the application. `wrangler.toml` sets the recipient app origin; change this only for an explicitly separate environment. The worker accepts at most 1.5 MB raw MIME by default, below Vercel’s body ceiling after base64 expansion. Keep `MAX_RAW_BYTES` synchronized with admin `maxMessageBytes`. The API also enforces its own bound.

Set an **R2 lifecycle rule** on the private `tempmails-mail-spool` bucket: expire all objects after **one day**. Never enable public bucket access. Use the Cloudflare dashboard to apply and verify the lifecycle rule. Queue messages contain opaque spool keys, the envelope recipient and a message digest; restrict access and do not export queue payloads into analytics.

In Cloudflare → Email → Email Routing:

1. Enable routing for `tempmails.live`.
2. Publish the **exact MX and TXT records Cloudflare presents**. Values vary by service/account; do not invent or copy records from another domain. Remove conflicting MX records if this domain is dedicated to TempMails. Do not replace an existing company email domain without planning that migration.
3. Create a catch-all rule and route it to `tempmails-inbound`.
4. In TempMails `/admin`, open Email domains → Check DNS. MX presence is a publication check, not proof of delivery. Inspect the displayed SPF result against Cloudflare’s requested records.
5. Activate the domain and, if desired, mark it as default.
6. Open the homepage, complete Turnstile, and send a message from an external mailbox to the generated address. Check plain text, formatted view, and real-time arrival. Test an expired address too.

A worker queue consumer signs `timestamp + '.' + exactJSONBody` using HMAC-SHA256. The application requires a five-minute timestamp window, valid signature, known provider, and active envelope recipient. Never route mail based only on a MIME `To` header.

## 4. Cleanup, delivery failures and monitoring

`worker/wrangler.toml` schedules a Cloudflare Cron Trigger every five minutes. The Worker calls `/api/cron/cleanup` with `Authorization: Bearer CRON_SECRET`; set the same secret on both services. This keeps cleanup independent of Vercel Cron plan restrictions. A trusted external scheduler with the same header can be used instead. Expiration is enforced synchronously on reads and delivery; cleanup controls physical deletion latency.

The job deletes expired inboxes and cascades messages, attachments and tokens, removes old sessions/logs, checks domain DNS and sends an optional once-daily alert when open abuse reports exceed ten. Monitor job failures. Configure an external uptime check against `/api/health`; it verifies PostgreSQL and Redis without exposing connection details.

Cloudflare queues retry temporary errors. Permanent invalid-recipient, policy and oversize responses are acknowledged and removed. After eight failed attempts, messages go to `tempmails-failed`. Alert on dead-letter queue depth in Cloudflare. Use its queue dashboard/API to replay job references to `tempmails-inbound` after fixing the failure, within the one-day spool retention. Replaying is safe because provider keys are idempotent. If a spool object has expired, the raw mail cannot be recovered; ask the sender to resend to an active inbox.

## 5. Launch configuration

In `/admin`:

- Set operator identity/contact, review legal pages for your jurisdiction, and publish your actual processor/retention disclosures.
- Set retention, maximum lifetime, quotas, allowed usernames and domain availability.
- Configure logo/favicon and SEO metadata. Public content is editable text, with visible FAQs used for FAQ JSON-LD.
- Enroll owner TOTP; save the backup codes offline. Add staff with the least required role.
- Leave attachments disabled unless the scanner is deployed and tested. Only verified PDF/PNG/JPEG/GIF/WebP files can be accepted. Archives, executable formats and unrecognized MIME types are not accepted.
- Optional custom scripts run in an isolated, network-disabled sandbox; they cannot inspect the inbox DOM. Sponsored link slots remain available. Optional Google AdSense placements load Google advertising scripts when enabled with a slot ID; see ADSENSE.md.
- Confirm backups and restoration, clean up the test inbox, and check the deployment against the acceptance checklist.

## Troubleshooting

| Symptom | Check |
|---|---|
| No email domain | Seed domain starts disabled. Configure routing, then activate it. |
| Inbox creation blocked | Check Turnstile hostname/action, exact APP_URL origin, Redis, rate limits and domain maintenance. |
| No mail arrives | Check MX, catch-all Worker rule, queue depth, signing secret, active recipient and expiry. |
| Inbound 401 | Signing secret mismatch, timestamp skew, or changed JSON bytes after signing. |
| Inbound 413 | Raw email or encoded HTTP payload exceeds configured limits. |
| Attachment missing | Attachments disabled, unsafe extension/MIME, size limit, or no scanner configured. |
| SSE reconnects | Connections intentionally rotate after 20 seconds; a 15-second fetch fallback also checks the inbox. |
| Admin login fails | Rate limit, password, TOTP time synchronization, used recovery code or disabled user. |
| Database unavailable | Verify TLS, pooling settings, network allowlists and migrations. Health endpoint must return 200. |
| Cleanup late | Confirm scheduler frequency/plan and exact Bearer secret. |

The optional `analyticsId` setting is an operator label for first-party aggregate traffic, not a third-party JavaScript loader. The dashboard records page views without message/address/token values. This analytics field does not load tracking scripts; separately configured AdSense placements do load Google advertising scripts. Canonical host changes use APP_URL in the deployment environment so an untrusted content editor cannot redirect authentication or canonical links to another host.

## Namecheap registration with Cloudflare DNS

Your registration can remain at Namecheap. To use Cloudflare Email Routing, add `tempmails.live` to your Cloudflare account first, review/import every existing DNS record, and obtain the two account-specific nameservers Cloudflare assigns. In Namecheap Domain List → Manage → Nameservers, choose **Custom DNS** and enter those exact nameservers. Do not use example nameserver values. Wait for Cloudflare to confirm that the zone is active, then configure the Email Routing MX/TXT records and the Vercel website record.

A DNS check on 13 September 2026 returned Name.com authoritative nameservers and no MX records. Registrar and DNS host can differ. Confirm which account currently controls those nameservers before replacing them; retain any existing non-TempMails records when importing DNS.

The new Vercel project is `tempmails` in `samirs-projects-95a2c475`. Local project linking is stored in ignored `.vercel/project.json`.

Cleanup scheduling uses the official [Cloudflare Cron Trigger API](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
