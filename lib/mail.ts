import { simpleParser } from "mailparser";
import { fileTypeFromBuffer } from "file-type";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { settings } from "./settings";
import { ApiError, metric } from "./http";
import { safeHtml, hash } from "./security";
import { changed } from "./inbox";
export interface InboundEnvelope {
  provider: string;
  eventId: string;
  recipient: string;
  raw: string;
}
const dangerous =
  /\.(exe|dll|bat|cmd|com|scr|ps1|js|vbs|msi|jar|html?|svg|zip|rar|7z|docm|xlsm)$/i;
export async function receiveMail(envelope: InboundEnvelope) {
  const cfg = await settings();
  const bytes = Buffer.from(envelope.raw, "base64");
  if (bytes.length > cfg.maxMessageBytes)
    throw new ApiError(413, "MESSAGE_TOO_LARGE");
  const key = hash(
    `${envelope.provider}:${envelope.eventId}:${envelope.recipient.toLowerCase()}`,
  );
  if (await db.webhookEvent.findUnique({ where: { key } }))
    return { duplicate: true };
  const parts = envelope.recipient.toLowerCase().split("@");
  if (parts.length !== 2) throw new ApiError(400, "INVALID_RECIPIENT");
  const inbox = await db.inbox.findFirst({
    where: {
      username: parts[0],
      domain: { name: parts[1], active: true, maintenance: false },
      suspended: false,
      expiresAt: { gt: new Date() },
    },
  });
  if (!inbox || cfg.maintenance)
    throw new ApiError(410, "RECIPIENT_UNAVAILABLE");
  const mail = await simpleParser(bytes, {
    skipHtmlToText: false,
    skipTextToHtml: true,
    skipImageLinks: true,
    maxHtmlLengthToParse: cfg.maxMessageBytes,
  });
  const sender = (mail.from?.value[0]?.address ?? "unknown").toLowerCase();
  const subject = (mail.subject ?? "(No subject)").slice(0, 500);
  const text = (mail.text ?? "").slice(0, cfg.maxMessageBytes);
  const blocked = await db.blocklist.findMany();
  if (
    blocked.some(
      (b) =>
        (b.kind === "sender" && sender === b.value) ||
        (b.kind === "domain" && sender.split("@")[1] === b.value) ||
        (b.kind === "keyword" &&
          `${subject}\n${text}`.toLowerCase().includes(b.value)),
    )
  ) {
    await metric("mail_blocked");
    throw new ApiError(422, "MESSAGE_BLOCKED");
  }
  const attachments: Prisma.AttachmentCreateWithoutMessageInput[] = [];
  for (const a of mail.attachments) {
    if (!cfg.attachments) continue;
    const name = (a.filename ?? "attachment")
      .replace(/[\x00-\x1f/\\"]/g, "_")
      .slice(0, 180);
    if (
      dangerous.test(name) ||
      blocked.some(
        (b) =>
          b.kind === "extension" && name.toLowerCase().endsWith(`.${b.value}`),
      ) ||
      a.size > cfg.maxAttachmentBytes
    )
      continue;
    const type = await fileTypeFromBuffer(a.content);
    if (
      !type ||
      ![
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
      ].includes(type.mime) ||
      type.mime !== a.contentType
    )
      continue;
    if (!process.env.MALWARE_SCAN_URL || !process.env.MALWARE_SCAN_SECRET)
      continue;
    const scan = await fetch(process.env.MALWARE_SCAN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${process.env.MALWARE_SCAN_SECRET}`,
      },
      body: new Uint8Array(a.content),
      signal: AbortSignal.timeout(15000),
    });
    if (!scan.ok) throw new ApiError(503, "SCANNER_UNAVAILABLE");
    if ((await scan.json()).clean !== true) continue;
    attachments.push({
      name,
      mime: type.mime,
      size: a.size,
      bytes: new Uint8Array(a.content),
      scanStatus: "CLEAN",
    });
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inbox" WHERE id = ${inbox.id} FOR UPDATE`;
      const live = await tx.inbox.findUnique({
        where: { id: inbox.id },
        include: { domain: true },
      });
      if (
        !live ||
        live.suspended ||
        live.expiresAt <= new Date() ||
        !live.domain.active ||
        live.domain.maintenance
      )
        throw new ApiError(410, "RECIPIENT_UNAVAILABLE");
      if (
        (await tx.message.count({ where: { inboxId: inbox.id } })) >=
        cfg.maxMessages
      )
        throw new ApiError(422, "INBOX_FULL");
      await tx.webhookEvent.create({ data: { key, status: "PROCESSED" } });
      await tx.message.create({
        data: {
          inboxId: inbox.id,
          providerKey: key,
          sender,
          senderName: (mail.from?.value[0]?.name ?? "").slice(0, 200),
          recipient: envelope.recipient.toLowerCase(),
          subject,
          text,
          html: safeHtml(typeof mail.html === "string" ? mail.html : "", true),
          size: bytes.length,
          attachments: { create: attachments },
        },
      });
      await tx.systemMetric.create({
        data: { kind: "mail_received", value: 1 },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { duplicate: true };
    throw e;
  }
  await changed(inbox.id).catch(() => {});
  return { accepted: true };
}
