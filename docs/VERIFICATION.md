# Verification report

Verified locally on 13 September 2026 against PostgreSQL 16 and Redis. The restored source was rebuilt and rechecked after the original Downloads folder was no longer present.

| Check | Result |
|---|---|
| ESLint | Passed, no errors or warnings |
| Strict TypeScript | Passed |
| Production Next.js build | Passed |
| Security unit tests | 8 passed |
| PostgreSQL + Redis integration tests | 16 passed |
| Cloudflare Worker TypeScript | Passed |
| Dependency audit | Zero known vulnerabilities in app and worker install reports |
| Browser end-to-end flow | Passed: create → signed inbound → real-time arrival → read → delete |
| Browser UI checks | Customization dialog, theme switching, Nepali switching and admin login gate passed |
| Browser runtime errors | None captured by pageerror |
| Horizontal overflow at 390px | None |
| axe accessibility | Zero violations in tested desktop, mobile, customization dialog and admin-login states |

The integration suite verifies high-entropy access, idempotent initialization, cross-origin rejection, webhook signatures, delivery deduplication, inbox isolation, safe HTML, recovery rotation, extension, owned signed attachment downloads, deletion, admin role enforcement, TOTP enrollment, concurrent single-use recovery codes, domain deletion protection and expiry.

Evidence: `browser-results.json` and screenshots in `screenshots/`. Automated accessibility checks cover the tested states only; they are not a WCAG certification. Lighthouse performance targets and real-device testing have not been measured on production.

Not yet verified: public SMTP delivery through Cloudflare, production Turnstile, external malware scanner, live DNS routing, Cloudflare scheduled cleanup execution, production failover and backup restoration. These require the corresponding accounts and production deployment configuration. The development database is clearly labeled as a local preview and is never used by a cloud deployment.
