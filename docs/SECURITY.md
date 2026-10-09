# Security, operations and recovery

## Enforced boundaries

- Opaque 256-bit inbox/access tokens; hash-only persistence; HttpOnly + Secure (production) + SameSite=Strict cookies.
- Browser mutations require exact origin. Inbound mail and scheduled jobs use separate authentication mechanisms.
- Constant-time HMAC/signature comparison, five-minute replay window, transactional provider-key deduplication.
- Raw body streaming has a byte cap before JSON parsing. MIME and attachment byte limits are checked independently.
- HTML allowlist sanitization and sandboxed message iframe, remote images blocked by default, no scripts/forms/SVG/styles from mail.
- Attachment magic-byte MIME checks, fixed safe MIME allowlist, dangerous extension blocking, fail-closed malware scanning. Downloads need both inbox access and a short-lived signature.
- Prisma parameterized queries, bounded pagination, role-checked admin endpoints, no message bodies in staff views.
- Scrypt passwords, optional encrypted TOTP, replay protection, single-use hashed recovery codes, idle/absolute session expiry and revocation.
- Redis atomic rate windows, per-device and keyed-IP creation limits, login/account rate limits, custom username restrictions and retained address tombstones.
- No arbitrary remote fetch based on user/mail URLs. Scanner and monitoring destinations come only from operator environment settings. No remote-image proxy (the explicit opt-in browser load may reveal client IP).
- Strict nonce + `'strict-dynamic'` script CSP, HSTS, `strict-origin-when-cross-origin` referrer (origin only, no paths; message iframes stay `no-referrer`), no-store for APIs/private views, noindex for admin/API and cookie-authenticated homepage responses. `connect-src`/`frame-src` allow `https:` for ad networks — see `docs/MONETIZATION.md`. `'unsafe-eval'` is granted to the public pages only, because ad tags evaluate strings at runtime, and the same boundary allows an ad overlay's Google Fonts stylesheet; `/admin` and `/api` keep the policy without either, and `contentSecurityPolicy()` in `proxy.ts` is unit-tested on that boundary.

## Operational checklist before public launch

- Verify the domain is owned and dedicated to this service; test DNS and actual external SMTP delivery.
- Test with production Turnstile credentials and a trusted, overwriting proxy IP header.
- Enroll owner two-factor authentication; remove bootstrap password; restrict staff roles.
- Run migrations once, use separate environment secrets, confirm TLS and database access restrictions.
- Confirm cron success and one-day R2 lifecycle. Alert on HTTP health failures and dead-letter queue depth.
- If enabling attachments, test malicious/clean samples against the selected scanner. Do not describe unscanned files as safe.
- Review operator legal disclosures, contacts, retention and subprocessors. Supplied legal text is an operational starting point requiring operator-specific completion.
- Disable request-body logging at Vercel, Cloudflare, reverse proxies and third-party error tools. Never send inbox addresses, tokens, content or attachment names to analytics.
- Perform an independent security review and real-device accessibility/performance checks before asserting a production SLA or WCAG certification.

## PostgreSQL backups

Use your managed provider’s encrypted backups and point-in-time recovery. Limit backup retention to your published policy. A backup may contain previously deleted mail until that backup expires. Document this clearly.

From a trusted operator terminal, with DATABASE_URL loaded securely:

```sh
pg_dump --format=custom --no-owner --file=tempmails-backup.dump "$DATABASE_URL"
```

Encrypt the output before storing it outside the database provider. Keep APP_SECRET in a separate secret manager backup; it is needed for enrolled TOTP secrets. Never put dumps or secrets in Git or a public bucket.

Restore first into a new, isolated database:

```sh
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" tempmails-backup.dump
```

Run migrations, revoke restored admin sessions, and run cleanup **before exposing the restored service**. Inbox authorization checks reject expired records even after restoration, but cleanup removes their stored contents. Verify counts, indices, log policy and a non-sensitive test flow. Keep outbound alerts and live inbound routing disabled during restore drills. Switch production only after validating the recovery. Do not restore old mail into an already live database without a reviewed migration plan.

Redis stores disposable rate limits/revisions; it need not be restored with message data. A restart must not grant additional database access. Queue spools expire after one day; they are not backups.

## Known deployment-dependent limits

SSE is bounded to fit Vercel execution limits and falls back to polling. SMTP delivery, Cloudflare retry scheduling, real DNS, real CAPTCHA, malware scanner behavior and production performance can only be verified after those accounts are connected. No code-only test can establish those guarantees.
