import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { settings, Settings } from "./settings";
import {
  ApiError,
  bot,
  check,
  consume,
  ipHash,
  metric,
  redis,
} from "./http";
import { hash } from "./security";
import { changed } from "./inbox";
import { siteOrigin } from "./site-url";

// ---------------------------------------------------------------------------
// Outbound (anonymous) mail
//
// A visitor may send a plain-text message *from* their temporary address.
// Delivery is provider neutral:
//   - recipient on a hosted temp domain  -> written straight into that inbox
//   - external recipient                 -> Resend HTTP API or SMTP (nodemailer)
// Every attempt is written to OutboundMessage so moderators can act on abuse
// reports. Rows cascade with the sending inbox.
// ---------------------------------------------------------------------------

export const sendSchema = z
  .object({
    to: z.string().trim().min(3).max(254),
    subject: z.string().trim().max(200).default(""),
    text: z.string().min(1).max(20000),
    captcha: z.string().max(4096).optional(),
  })
  .strict();
export type SendInput = z.infer<typeof sendSchema>;

// Strict ASCII address: no display names, no comments, no quoted local parts,
// no IDN. Keeps provider behaviour predictable and blocks header games.
const address =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export function normalizeRecipient(raw: string) {
  const s = raw.trim().toLowerCase();
  if (s.length > 254 || !address.test(s)) return null;
  const [local] = s.split("@");
  if (local.length > 64) return null;
  return s;
}

// Control characters cannot appear in headers; keep only \n and \t in bodies.
export const cleanSubject = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
export const cleanText = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
// Brand watermark appended to every outbound mail.
//
// Deliverability notes (Gmail/Outlook scoring):
//   - one link only; the same URL twice in a short mail reads as promotional
//   - no "prank" / "anonymous" / "free" vocabulary; those are spam-filter tokens
//   - short and factual; long disclaimers below a one-line body tank the ratio
export const TAGLINE = "Simple, private temporary email.";
const brand = () => {
  const url = siteOrigin();
  return { url, host: url.replace(/^https?:\/\//, "") };
};
// Display name shown in the recipient's client. "<user> via <Site>" is the
// pattern Google Groups / Slack / Notion use for relayed mail and is treated
// as legitimate by filters, unlike a bare random string.
export const displayName = (username: string, siteName: string) =>
  `${username} via ${siteName}`;
export function footer(cfg: Pick<Settings, "sendFooter" | "name">, ref: string) {
  const { url, host } = brand();
  return (
    `\n\n--\nSent with ${host} — ${TAGLINE}\n${url}\n` +
    `Ref ${ref}. ${cfg.sendFooter}`
  );
}
export function toHtml(
  body: string,
  cfg: Pick<Settings, "sendFooter" | "name">,
  ref: string,
) {
  const { url, host } = brand();
  return (
    `<!doctype html><html><body style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#172524;margin:0;padding:16px">` +
    `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(body)}</div>` +
    `<hr style="border:0;border-top:1px solid #e3e8e7;margin:24px 0 10px">` +
    `<p style="margin:0 0 4px;font-size:13px;color:#4a5654">` +
    `Sent with <a href="${url}" style="color:#0f8b7a;font-weight:600;text-decoration:none">${escape(host)}</a> &mdash; ${escape(TAGLINE)}</p>` +
    `<p style="margin:0;font-size:11px;line-height:1.5;color:#8a9492">Ref ${escape(ref)}. ${escape(cfg.sendFooter)}</p>` +
    `</body></html>`
  );
}

export type Provider = "resend" | "smtp" | null;
export function provider(): Provider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_URL) return "smtp";
  return null;
}

// True when the site can currently send *external* mail. Internal
// (temp-to-temp) delivery works without a provider, so the UI only needs the
// operator toggle; this flag drives the message shown in the compose dialog.
export const externalDelivery = () => provider() !== null;

interface Envelope {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  ref: string;
}
async function viaResend(m: Envelope) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `outbound/${m.ref}`,
    },
    body: JSON.stringify({
      from: `${m.fromName} <${m.from}>`,
      to: [m.to],
      reply_to: m.from,
      subject: m.subject,
      text: m.text,
      html: m.html,
      headers: { "X-Entity-Ref-ID": m.ref },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await r.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!r.ok) throw new Error(body.message || body.name || `HTTP ${r.status}`);
  return body.id ?? null;
}
async function viaSmtp(m: Envelope) {
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(process.env.SMTP_URL!, {
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const info = await transport.sendMail({
    from: { name: m.fromName, address: m.from },
    to: m.to,
    replyTo: m.from,
    subject: m.subject,
    text: m.text,
    html: m.html,
    // Message-ID on our own domain keeps the header set self-consistent with
    // the DKIM d= domain; relays otherwise stamp their own hostname.
    messageId: `<${m.ref}@${m.from.split("@")[1]}>`,
    headers: { "X-Entity-Ref-ID": m.ref },
  });
  return info.messageId ?? null;
}

export async function sendMail(
  req: NextRequest,
  inbox: { id: string; username: string; domain: { name: string } },
  input: SendInput,
) {
  const cfg = await settings();
  if (cfg.maintenance) throw new ApiError(503, "MAINTENANCE");
  if (!cfg.sendingEnabled) throw new ApiError(403, "SENDING_DISABLED");
  const to = normalizeRecipient(input.to);
  if (!to) throw new ApiError(400, "INVALID_RECIPIENT");
  const from = `${inbox.username}@${inbox.domain.name}`;
  if (to === from) throw new ApiError(400, "INVALID_RECIPIENT");
  const subject = cleanSubject(input.subject) || "(No subject)";
  const body = cleanText(input.text);
  if (!body) throw new ApiError(400, "EMPTY_MESSAGE");
  if (body.length > cfg.sendMaxChars) throw new ApiError(413, "MESSAGE_TOO_LONG");

  // Blocklists apply in both directions: a blocked address or domain can
  // neither reach a temp inbox nor be targeted from one.
  const blocked = await db.blocklist.findMany();
  const toDomain = to.split("@")[1];
  if (
    blocked.some(
      (b) =>
        (b.kind === "sender" && to === b.value) ||
        (b.kind === "domain" && toDomain === b.value),
    )
  )
    throw new ApiError(403, "RECIPIENT_BLOCKED");
  if (
    blocked.some(
      (b) =>
        b.kind === "keyword" &&
        `${subject}\n${body}`.toLowerCase().includes(b.value),
    )
  ) {
    await metric("send_blocked");
    throw new ApiError(422, "MESSAGE_BLOCKED");
  }

  // Limits are checked before any work and consumed only after a delivery
  // attempt has been recorded, so validation failures never burn quota.
  const device = req.cookies.get("tm_device")?.value ?? "";
  const ip = ipHash(req);
  const keys = {
    inbox: `send:inbox:${inbox.id}`,
    device: `send:device:${hash(device || ip)}`,
    ip: `send:ip:${ip}`,
    day: `send:day:${new Date().toISOString().slice(0, 10)}`,
  };
  await check(keys.inbox, cfg.sendLimitPerInbox);
  await check(keys.device, cfg.sendLimitPerDevice);
  await check(keys.ip, cfg.sendLimitPerDevice * 5);
  await check(keys.day, cfg.sendLimitPerDay);
  await bot(req, input.captcha, "send-mail");

  // Serialise per-inbox sends so parallel requests cannot race the counter.
  const lock = `lock:send:${inbox.id}`;
  if (!(await redis().set(lock, "1", "EX", 15, "NX")))
    throw new ApiError(429, "TOO_MANY_REQUESTS");
  try {
    await check(keys.inbox, cfg.sendLimitPerInbox);
    const localDomain = await db.domain.findFirst({
      where: { name: toDomain, active: true, maintenance: false },
      select: { id: true },
    });
    const record = await db.outboundMessage.create({
      data: {
        inboxId: inbox.id,
        sender: from,
        recipient: to,
        subject,
        text: body,
        size: Buffer.byteLength(body),
        delivery: localDomain ? "local" : (provider() ?? "none"),
        status: "PENDING",
        ipHash: ip,
      },
      select: { id: true, publicId: true },
    });
    const text = body + footer(cfg, record.publicId);
    const html = toHtml(body, cfg, record.publicId);
    let status = "SENT",
      providerId: string | null = null,
      error: string | null = null;
    if (localDomain) {
      status = await deliverLocal(cfg, {
        localDomainId: localDomain.id,
        ref: record.publicId,
        from,
        fromName: displayName(inbox.username, cfg.name),
        to,
        subject,
        text,
        html,
      });
    } else {
      const p = provider();
      if (!p) {
        await db.outboundMessage.update({
          where: { id: record.id },
          data: { status: "FAILED", error: "NO_PROVIDER" },
        });
        throw new ApiError(503, "SENDING_UNAVAILABLE");
      }
      const env: Envelope = {
        from,
        fromName: displayName(inbox.username, cfg.name),
        to,
        subject,
        text,
        html,
        ref: record.publicId,
      };
      try {
        providerId = p === "resend" ? await viaResend(env) : await viaSmtp(env);
      } catch (e) {
        status = "FAILED";
        error = (e instanceof Error ? e.message : "PROVIDER_ERROR").slice(0, 300);
      }
    }
    await db.outboundMessage.update({
      where: { id: record.id },
      data: { status, providerId, error },
    });
    await Promise.all([
      consume(keys.inbox, 3600),
      consume(keys.device, 86400),
      consume(keys.ip, 86400),
      consume(keys.day, 86400),
    ]);
    if (status === "FAILED") {
      await metric("send_failed");
      throw new ApiError(502, "DELIVERY_FAILED");
    }
    await metric("mail_sent");
    return {
      id: record.publicId,
      to,
      subject,
      status: publicStatus(status),
      createdAt: new Date(),
    };
  } finally {
    await redis().del(lock).catch(() => {});
  }
}

// Temp-to-temp delivery. Returns "SENT" whether or not the recipient inbox
// exists so that the sender cannot probe which addresses are active; the
// audit row records the real outcome.
async function deliverLocal(
  cfg: Settings,
  m: Envelope & { localDomainId: string },
) {
  const [username] = m.to.split("@");
  const target = await db.inbox.findFirst({
    where: {
      username,
      domainId: m.localDomainId,
      suspended: false,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!target) return "SENT_NO_MAILBOX";
  const key = hash(`outbound:${m.ref}:${m.to}`);
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inbox" WHERE id = ${target.id} FOR UPDATE`;
      if (
        (await tx.message.count({ where: { inboxId: target.id } })) >=
        cfg.maxMessages
      )
        throw new ApiError(422, "INBOX_FULL");
      await tx.webhookEvent.create({ data: { key, status: "PROCESSED" } });
      await tx.message.create({
        data: {
          inboxId: target.id,
          providerKey: key,
          sender: m.from,
          senderName: m.fromName,
          recipient: m.to,
          subject: m.subject,
          text: m.text,
          html: m.html,
          size: Buffer.byteLength(m.text),
        },
      });
      await tx.systemMetric.create({ data: { kind: "mail_received" } });
    });
  } catch (e) {
    if (e instanceof ApiError && e.code === "INBOX_FULL") return "SENT_FULL";
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return "SENT";
    throw e;
  }
  await changed(target.id).catch(() => {});
  return "SENT";
}

export const sentSelect = {
  publicId: true,
  recipient: true,
  subject: true,
  status: true,
  createdAt: true,
} as const;
// Only moderators see the precise local outcome (SENT_NO_MAILBOX, SENT_FULL).
export const publicStatus = (s: string) =>
  s.startsWith("SENT") ? "SENT" : s;
export async function sentList(inboxId: string) {
  const rows = await db.outboundMessage.findMany({
    where: { inboxId },
    select: sentSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.publicId,
    to: r.recipient,
    subject: r.subject,
    status: publicStatus(r.status),
    createdAt: r.createdAt,
  }));
}
