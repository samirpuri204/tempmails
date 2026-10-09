# API contract

All endpoints are under `/api`. Success: `{"data": ...}`. Failure: `{"error":{"code":"...","message":"..."}}`. Data is never cached. Browser mutations require an exact `Origin` matching APP_URL, JSON bodies when applicable, and SameSite cookies. Do not put access or recovery tokens into a query string, fragment, analytics event or log.

Public inbox operations authenticate with `tm_inbox` (HttpOnly). Admin operations use a separate `tm_admin`. Public identifiers are random UUIDs; internal relational IDs are not exposed by inbox APIs. Content is never returned through admin message endpoints.

| Method | Path | Body / behavior |
|---|---|---|
| GET | `/config` | Active selectable domains and public service settings |
| POST | `/inbox` | `{username?,domain?,captcha?}`; idempotently returns an existing active cookie inbox when no custom options; otherwise issues address, expiry, one-time-displayed recovery token and secure cookie |
| GET | `/inbox` | Current address and expiry |
| DELETE | `/inbox` | Deletes entire inbox with cascading contents/tokens |
| POST | `/inbox/extend` | Adds configured retention, bounded by maximum lifetime |
| POST | `/restore` | `{token}`; active recovery only, rotates browser access token |
| GET | `/messages` | `search`, `order=newest|oldest`, `page` (20 records/page); returns total, unread and metadata |
| GET | `/messages/:uuid` | Marks read, returns text and sanitized HTML. `images=1` explicitly permits HTTPS images |
| DELETE | `/messages/:uuid` | Deletes one owned message |
| POST | `/messages/:uuid/report` | `{reason}` (5–1000 chars) |
| POST | `/attachments/:uuid/ticket` | Returns a 60-second signed URL, still bound to authenticated inbox |
| GET | `/attachments/:uuid` | Signed `expires` and `signature` query; forces attachment download, never exposes DB/storage paths |
| GET | `/events` | SSE `inbox` events with revision only; no content or credential. Reconnect after bounded 20s streams. `unavailable` ends access |
| POST | `/send` | `{to,subject?,text,captcha?}`; sends plain text *from* the authenticated inbox. Requires the operator setting `sendingEnabled`; Turnstile action `send-mail`. Returns `201 {id,to,subject,status,createdAt}`. Rate-limited per inbox/hour, per device/day, per IP/day and site-wide/day; failed validation never consumes quota |
| GET | `/sent` | Last 50 outbound messages of the authenticated inbox: `{id,to,subject,status,createdAt}`; `status` is `SENT`, `FAILED` or `PENDING` only |
| POST | `/inbound` | Signed provider envelope described below |
| GET | `/health` | PostgreSQL + Redis readiness |
| GET/POST | `/cron/cleanup` | Distinct cron Bearer secret |

Inbound body: `{provider:"cloudflare"|"custom",eventId:string,recipient:string,raw:base64MIME}`. Headers: `x-mail-timestamp` (Unix seconds) and `x-mail-signature` (hex HMAC-SHA256). Signature input is `${timestamp}.${rawRequestBody}`. Retrying the same provider/event/recipient is idempotent. A custom provider adapter must verify its own provider’s authenticity before converting and signing this envelope. Never expose INBOUND_SECRET to browsers.

`GET /config` includes `sending:{enabled,external,maxChars,limitPerInbox}`. `enabled` mirrors the operator toggle; `external` is true only when a delivery provider (`RESEND_API_KEY` or `SMTP_URL`) is configured — otherwise only recipients on hosted temp domains can be reached and the client says so. Outbound recipients must be a strict ASCII address (no display name, comments, quoted local part or IDN). The body is normalised to `\n`, stripped of control characters, capped at `maxChars`, and gets a footer with the public reference UUID appended. Blocklist `sender`/`domain` entries reject matching recipients (`403 RECIPIENT_BLOCKED`); `keyword` entries reject matching bodies (`422 MESSAGE_BLOCKED`). Temp-to-temp delivery always reports `SENT` to the visitor regardless of whether the target inbox exists, so addresses cannot be enumerated.

Send error codes: `403 SENDING_DISABLED`, `400 INVALID_RECIPIENT`, `400 EMPTY_MESSAGE`, `413 MESSAGE_TOO_LONG`, `403 RECIPIENT_BLOCKED`, `422 MESSAGE_BLOCKED`, `429 TOO_MANY_REQUESTS`, `503 SENDING_UNAVAILABLE` (no provider for an external recipient), `502 DELIVERY_FAILED` (provider rejected; the attempt is recorded and counted).

| Admin path | Method | Permission / body |
|---|---|---|
| `/admin/login` | POST | `{email,password,code?}`; rate-limited; no session required |
| `/admin/me` | GET | Session identity and effective permissions |
| `/admin/logout` | POST | Revoke current session |
| `/admin/sessions` | GET, DELETE | Own sessions; DELETE `{id}` |
| `/admin/password` | POST | `{current,password}`; revokes other sessions |
| `/admin/2fa/setup` | POST | `{password}`; returns secret/otpauth URI |
| `/admin/2fa/enable` | POST | `{code}`; returns ten one-use recovery codes |
| `/admin/analytics` | GET | Any admin; `days=1|7|30` |
| `/admin/domains` | GET, POST, DELETE | Domain permission. POST name/active/selectable/maintenance/isDefault; DELETE name/confirmation/expireInboxes |
| `/admin/domains/check` | POST | `{name}`; DNS MX/SPF lookup |
| `/admin/inboxes` | GET, PATCH, DELETE | Moderate; PATCH `{publicId,suspended}`; DELETE `{publicId}` |
| `/admin/messages` | GET, DELETE | Moderate; metadata only; DELETE `{publicId}` |
| `/admin/outbound` | GET | Moderate; visitor-sent mail metadata (sender, recipient, subject, size, delivery, exact status incl. `SENT_NO_MAILBOX`/`SENT_FULL`, error, ipHash, owning inbox). Filters: search (subject), sender, recipient, ipHash, status, from/to, page (50/page). Bodies are never returned |
| `/admin/reports` | GET, PATCH | Moderate; PATCH `{id,status:"OPEN"|"RESOLVED"}` |
| `/admin/blocklist` | GET, POST, DELETE | Moderate; `{kind:"sender"|"domain"|"keyword"|"extension"|"username",value}` |
| `/admin/cleanup` | POST | Moderate; bulk expired cleanup |
| `/admin/settings` | GET, POST | Settings permission; full validated settings object. Script editing requires OWNER |
| `/admin/pages` | GET, POST, DELETE | Content permission; slug/title/description/body/faqs/published |
| `/admin/posts` | GET, POST, DELETE | Content permission; slug/title/description/body/published |
| `/admin/redirects` | GET, POST, DELETE | Content permission; source/destination/permanent; safe relative paths only |
| `/admin/users` | GET, POST | Owner; email/role/active/password? |
| `/admin/audit` | GET | Settings permission; last 200 entries |
| `/admin/login-history` | GET | Settings permission; last 100 pseudonymous events |

Inbox/message admin filters: search, domain, sender, recipient, ipHash, status=all|active|expired|suspended, from/to as ISO datetimes, page (50 per page). Date/status/IP/domain filters scope the owning inbox; sender/recipient/subject filter message metadata. No staff body-search endpoint is provided.

Statuses: 400 malformed input, 401 missing/invalid credentials, 403 origin/permission/CAPTCHA violation, 404 inaccessible or absent record, 409 conflicts/confirmation/limits, 410 expired or disabled recipient, 413 oversized body, 422 mail policy rejection, 429 rate limit, 503 unavailable dependency. No stack traces or provider secrets are returned.
