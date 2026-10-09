import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { settings } from "./settings";
import {
  ApiError,
  ok,
  json,
  origin,
  rate,
  check,
  consume,
  ipHash,
  cookieOptions,
  bot,
  redis,
  metric,
} from "./http";
import {
  hash,
  token,
  validUsername,
  randomUsername,
  attachmentTicket,
  equal,
  safeHtml,
} from "./security";
import { inboxAuth, messageSelect, changed } from "./inbox";
import { sendMail, sendSchema, sentList, externalDelivery } from "./outbound";
import { contactSchema, deliverContact } from "./contact";
const createSchema = z
  .object({
    username: z.string().max(32).optional(),
    domain: z.string().max(253).optional(),
    captcha: z.string().max(4096).optional(),
  })
  .strict();
export async function publicApi(req: NextRequest, path: string) {
  const method = req.method;
  if (method !== "GET") origin(req);
  await rate(`request:${ipHash(req)}`, 180, 60);
  // Ad tag report: one counter per (country, placement, outcome) per day.
  //
  // "The ad does not show here" has causes that look identical from the
  // outside, and this is what tells them apart — the ad host never answered the
  // visitor's browser (ad blocker, a resolver or VPN that filters ad domains,
  // policy), or the tag loaded and the network chose not to serve. Deliberately
  // anonymous and aggregate: the country is read from the platform's own
  // request header rather than from the browser, nothing here identifies a
  // visitor, the counters expire after 30 days, and no ad delivery decision is
  // ever made from them (docs/MONETIZATION.md §10).
  if (path === "ads/fill" && method === "POST") {
    const body = await json(
      req,
      z
        .object({
          placement: z.string().min(1).max(60).regex(/^[A-Za-z0-9 -]+$/),
          state: z.enum(["filled", "blocked", "empty"]),
        })
        .strict(),
      2048,
    );
    const country = (req.headers.get("x-vercel-ip-country") || "XX")
      .slice(0, 2)
      .toUpperCase();
    const key = `ads:fill:${new Date().toISOString().slice(0, 10)}`;
    try {
      const count = await redis().hincrby(
        key,
        `${country}|${body.placement}|${body.state}`,
        1,
      );
      if (count === 1) await redis().expire(key, 2592000);
    } catch {
      // Best effort: measurement must never fail a page view.
    }
    return ok({ recorded: true });
  }
  if (path === "config" && method === "GET") {
    const s = await settings();
    await metric("page_view");
    const domains = await db.domain.findMany({
      where: { active: true, maintenance: false, selectable: true },
      select: { name: true, isDefault: true },
      orderBy: { isDefault: "desc" },
    });
    return ok({
      domains,
      customUsernames: s.customUsernames,
      retentionMinutes: s.retentionMinutes,
      maintenance: s.maintenance,
      accessMode: "private",
      sending: {
        enabled: s.sendingEnabled,
        external: s.sendingEnabled && externalDelivery(),
        maxChars: s.sendMaxChars,
        limitPerInbox: s.sendLimitPerInbox,
      },
    });
  }
  // Public contact form. Visitor-authored content that is delivered to the
  // operator and never stored: no database row is written, which keeps the
  // promise in the privacy policy ("message contents are not retained for a
  // contact enquiry") literally true rather than aspirational. Abuse controls
  // are the same ones the rest of the public surface uses — a per-IP window and
  // a Turnstile action bound to this form — plus a honeypot that costs a real
  // visitor nothing.
  if (path === "contact" && method === "POST") {
    await rate(`contact:${ipHash(req)}`, 5, 3600);
    const b = await json(req, contactSchema, 16384);
    const cfg = await settings();
    if (cfg.maintenance) throw new ApiError(503, "MAINTENANCE");
    // Honeypot: answer exactly as if it had been delivered. A rejection here
    // would tell an automated filler which field to leave alone next time.
    if (b.company) return ok({ received: true }, 201);
    // Either field carries the token: the widget's own hidden input is what a
    // real browser posts, and the explicit field is what a non-browser client
    // sends.
    await bot(req, b.captcha ?? b["cf-turnstile-response"], "contact");
    await metric("contact_message");
    await deliverContact(b);
    return ok({ received: true }, 201);
  }
  if (path === "inbox" && method === "POST") {
    const b = await json(req, createSchema);
    const cfg = await settings();
    if (cfg.maintenance) throw new ApiError(503, "MAINTENANCE");
    let existing;
    try {
      existing = await inboxAuth(req);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
    if (existing && !b.username && !b.domain)
      return ok({
        address: `${existing.username}@${existing.domain.name}`,
        expiresAt: existing.expiresAt,
      });
    let device = req.cookies.get("tm_device")?.value;
    if (!device || !/^[\w-]{43}$/.test(device)) device = token();
    // Per-device limit is the real per-user cap. The IP bucket is only a
    // backstop and gets headroom because carriers put many users behind one
    // NAT address. Neither bucket is consumed until the inbox is created.
    const ipKey = `create:${ipHash(req)}`,
      deviceKey = `device:${hash(device)}`;
    await check(deviceKey, cfg.creationLimit);
    await check(ipKey, cfg.creationLimit * 5);
    await bot(req, b.captcha);
    const domain = await db.domain.findFirst({
      where: {
        ...(b.domain ? { name: b.domain } : {}),
        active: true,
        maintenance: false,
        selectable: true,
      },
      orderBy: { isDefault: "desc" },
    });
    if (!domain) throw new ApiError(503, "NO_EMAIL_DOMAIN");
    const username =
      b.username?.toLowerCase() || randomUsername(cfg.usernameLength);
    if (b.username && (!cfg.customUsernames || !validUsername(username)))
      throw new ApiError(400, "USERNAME_NOT_ALLOWED");
    if (
      await db.blocklist.findFirst({
        where: { kind: "username", value: username },
      })
    )
      throw new ApiError(400, "USERNAME_NOT_ALLOWED");
    const access = token(),
      recovery = token(),
      expiresAt = new Date(Date.now() + cfg.retentionMinutes * 60000);
    try {
      await db.$transaction(async (tx) => {
        await tx.addressTombstone.create({
          data: { hash: hash(`${username}@${domain.name}`) },
        });
        await tx.inbox.create({
          data: {
            username,
            domainId: domain.id,
            ipHash: ipHash(req),
            deviceHash: hash(device!),
            expiresAt,
            tokens: {
              create: [
                { hash: hash(access), kind: "access" },
                { hash: hash(recovery), kind: "recovery" },
              ],
            },
          },
        });
        await tx.systemMetric.create({ data: { kind: "address_created" } });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002")
        throw new ApiError(409, "ADDRESS_ALREADY_USED");
      throw e;
    }
    await Promise.all([consume(deviceKey, 3600), consume(ipKey, 3600)]);
    const res = ok(
      {
        address: `${username}@${domain.name}`,
        expiresAt,
        recoveryToken: recovery,
      },
      201,
    );
    res.cookies.set("tm_inbox", access, {
      ...cookieOptions,
      maxAge: cfg.maxLifetimeMinutes * 60,
    });
    res.cookies.set("tm_device", device, {
      ...cookieOptions,
      maxAge: 86400 * 30,
    });
    return res;
  }
  if (path === "restore" && method === "POST") {
    await rate(`restore:${ipHash(req)}`, 10, 900);
    const b = await json(
      req,
      z.object({ token: z.string().regex(/^[\w-]{43}$/) }).strict(),
    );
    const t = await db.inboxToken.findUnique({
      where: { hash: hash(b.token) },
      include: { inbox: { include: { domain: true } } },
    });
    if (
      !t ||
      t.kind !== "recovery" ||
      t.inbox.expiresAt <= new Date() ||
      t.inbox.suspended ||
      !t.inbox.domain.active ||
      t.inbox.domain.maintenance
    )
      throw new ApiError(404, "RECOVERY_UNAVAILABLE");
    const access = token();
    await db.$transaction([
      db.inboxToken.deleteMany({
        where: { inboxId: t.inboxId, kind: "access" },
      }),
      db.inboxToken.create({
        data: { hash: hash(access), kind: "access", inboxId: t.inboxId },
      }),
    ]);
    const res = ok({
      address: `${t.inbox.username}@${t.inbox.domain.name}`,
      expiresAt: t.inbox.expiresAt,
    });
    res.cookies.set("tm_inbox", access, {
      ...cookieOptions,
      expires: t.inbox.expiresAt,
    });
    return res;
  }
  const i = await inboxAuth(req);
  if (path === "inbox" && method === "GET")
    return ok({
      address: `${i.username}@${i.domain.name}`,
      expiresAt: i.expiresAt,
    });
  if (path === "inbox" && method === "DELETE") {
    await db.inbox.delete({ where: { id: i.id } });
    await changed(i.id);
    const r = ok({ deleted: true });
    r.cookies.delete("tm_inbox");
    return r;
  }
  if (path === "inbox/extend" && method === "POST") {
    await rate(`extend:${i.id}`, 10, 3600);
    const s = await settings();
    const expiresAt = new Date(
      Math.min(
        i.expiresAt.getTime() + s.retentionMinutes * 60000,
        i.createdAt.getTime() + s.maxLifetimeMinutes * 60000,
      ),
    );
    if (expiresAt <= i.expiresAt)
      throw new ApiError(409, "MAXIMUM_LIFETIME_REACHED");
    await db.inbox.update({ where: { id: i.id }, data: { expiresAt } });
    const response = ok({ expiresAt });
    response.cookies.set("tm_inbox", req.cookies.get("tm_inbox")!.value, {
      ...cookieOptions,
      expires: expiresAt,
    });
    return response;
  }
  if (path === "send" && method === "POST") {
    await rate(`send:req:${ipHash(req)}`, 30, 600);
    const b = await json(req, sendSchema, 65536);
    return ok(await sendMail(req, i, b), 201);
  }
  if (path === "sent" && method === "GET") return ok(await sentList(i.id));
  if (path === "messages" && method === "GET") {
    const q = z
      .object({
        search: z.string().max(100).default(""),
        order: z.enum(["newest", "oldest"]).default("newest"),
        page: z.coerce.number().int().min(1).max(1000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const where = {
      inboxId: i.id,
      OR: [
        { subject: { contains: q.search, mode: "insensitive" as const } },
        { sender: { contains: q.search, mode: "insensitive" as const } },
        { text: { contains: q.search, mode: "insensitive" as const } },
      ],
    };
    const [messages, total, unread] = await Promise.all([
      db.message.findMany({
        where,
        select: messageSelect,
        orderBy: [
          { receivedAt: q.order === "oldest" ? "asc" : "desc" },
          { publicId: "asc" },
        ],
        take: 20,
        skip: (q.page - 1) * 20,
      }),
      db.message.count({ where }),
      db.message.count({ where: { inboxId: i.id, readAt: null } }),
    ]);
    return ok({ messages, total, unread, page: q.page });
  }
  const match = path.match(/^messages\/([a-f0-9-]{36})(?:\/(report))?$/);
  if (match) {
    const m = await db.message.findFirst({
      where: { publicId: match[1], inboxId: i.id },
      select: { ...messageSelect, id: true, text: true, html: true },
    });
    if (!m) throw new ApiError(404, "MESSAGE_NOT_FOUND");
    if (method === "GET" && !match[2]) {
      await db.message.update({
        where: { id: m.id },
        data: { readAt: new Date() },
      });
      const { id: _id, ...data } = m;
      void _id;
      return ok({
        ...data,
        html: safeHtml(m.html, req.nextUrl.searchParams.get("images") === "1"),
      });
    }
    if (method === "DELETE" && !match[2]) {
      await db.message.delete({ where: { id: m.id } });
      await changed(i.id);
      return ok({ deleted: true });
    }
    if (method === "POST" && match[2] === "report") {
      await rate(`report:${ipHash(req)}`, 5, 3600);
      const b = await json(
        req,
        z.object({ reason: z.string().min(5).max(1000) }).strict(),
      );
      await db.abuseReport.create({
        data: { messageRef: m.publicId, reason: b.reason, ipHash: ipHash(req) },
      });
      await metric("abuse_report");
      return ok({ reported: true }, 201);
    }
  }
  const aMatch = path.match(/^attachments\/([a-f0-9-]{36})(?:\/(ticket))?$/);
  if (aMatch) {
    const a = await db.attachment.findFirst({
      where: { publicId: aMatch[1], message: { inboxId: i.id } },
      select: { publicId: true, name: true, mime: true, scanStatus: true },
    });
    if (!a || a.scanStatus !== "CLEAN")
      throw new ApiError(404, "ATTACHMENT_UNAVAILABLE");
    if (method === "POST" && aMatch[2]) {
      const expires = Math.floor(Date.now() / 1000) + 60;
      return ok({
        url: `/api/attachments/${a.publicId}?expires=${expires}&signature=${attachmentTicket(a.publicId, i.id, expires)}`,
      });
    }
    if (method === "GET" && !aMatch[2]) {
      const expiry = Number(req.nextUrl.searchParams.get("expires"));
      if (
        !Number.isSafeInteger(expiry) ||
        expiry < Date.now() / 1000 ||
        expiry > Date.now() / 1000 + 65 ||
        !equal(
          attachmentTicket(a.publicId, i.id, expiry),
          req.nextUrl.searchParams.get("signature") || "",
        )
      )
        throw new ApiError(403, "DOWNLOAD_EXPIRED");
      const bytes = await db.attachment.findUniqueOrThrow({
        where: { publicId: a.publicId },
        select: { bytes: true },
      });
      return new Response(new Uint8Array(bytes.bytes), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
  }
  if (path === "events" && method === "GET") {
    const encoder = new TextEncoder();
    let ended = false;
    const stream = new ReadableStream({
      async start(controller) {
        let revision = "";
        const deadline = Date.now() + 20000;
        try {
          while (!req.signal.aborted && !ended && Date.now() < deadline) {
            await inboxAuth(req);
            const next = (await redis().get(`inbox:${i.id}`)) || "0";
            if (next !== revision) {
              controller.enqueue(
                encoder.encode(
                  `event: inbox\ndata: ${JSON.stringify({ revision: next })}\n\n`,
                ),
              );
              revision = next;
            } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch {
          if (!ended)
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
        } finally {
          if (!ended) {
            ended = true;
            controller.close();
          }
        }
      },
      cancel() {
        ended = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  throw new ApiError(404, "NOT_FOUND");
}
