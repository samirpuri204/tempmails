# TempMails architecture

Next.js App Router serves public SSR content, a client inbox, and protected admin tools. PostgreSQL is the source of truth. Prisma transactions create a message, its attachments and provider event together. Attachments are bounded bytea records: cascading removal is atomic and leaves no orphaned object storage. Redis provides distributed rate limits and an inbox revision signal. Short-lived SSE connections read revisions and renew, with periodic inbox fetching as a fallback.

Cloudflare Email Routing (MX) → Email Worker → private R2 spool → Cloudflare Queue → signed HTTPS webhook → MIME parser → policy checks → PostgreSQL transaction → Redis revision → SSE → inbox.

R2 contains transient raw mail only. Configure a one-day lifecycle. Successful processing deletes the spool object. Queue retries use exponential backoff; the dead-letter queue preserves failed job references for operator replay. No payload logging. The webhook validates a timestamped HMAC before parsing MIME, and uses the signed envelope recipient rather than the spoofable To header. A provider adapter interface isolates the ingress transport.

Inbox access uses a random 256-bit token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 hash exists in the database. A separate, one-time-issued recovery token can mint a new session and revoke old sessions. Neither appears in a URL. Address names are globally unique and retained as one-way tombstones after deletion so an old address cannot be reissued. Expiry is enforced at every read and ingress, independently of the cleanup scheduler.

Admin sessions use independent opaque tokens, idle and absolute deadlines. Passwords use scrypt. TOTP secrets are AES-GCM encrypted; recovery codes are hashed and consumed transactionally. Role permissions are enforced on the server. Lower roles receive message metadata only; no admin role reads content through admin endpoints. Mutations require exact same-origin browser requests; signed provider and cron endpoints use distinct authentication.

Do not deploy before configuring PostgreSQL, Redis, secrets, email routing and scheduler. Production fails closed if dependencies or bot protection are unavailable. No demo messages or invented service health are served.
