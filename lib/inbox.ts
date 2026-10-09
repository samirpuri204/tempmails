import { NextRequest } from "next/server";
import { db } from "./db";
import { ApiError, redis } from "./http";
import { hash } from "./security";
export async function inboxAuth(req: NextRequest) {
  const raw = req.cookies.get("tm_inbox")?.value;
  if (!raw) throw new ApiError(401, "INBOX_REQUIRED");
  const t = await db.inboxToken.findUnique({
    where: { hash: hash(raw) },
    include: { inbox: { include: { domain: true } } },
  });
  if (!t || t.kind !== "access") throw new ApiError(401, "INBOX_REQUIRED");
  const i = t.inbox;
  if (
    i.expiresAt <= new Date() ||
    i.suspended ||
    !i.domain.active ||
    i.domain.maintenance
  )
    throw new ApiError(410, "INBOX_UNAVAILABLE");
  return i;
}
export async function changed(id: string) {
  await redis().incr(`inbox:${id}`);
  await redis().expire(`inbox:${id}`, 86400);
}
export const messageSelect = {
  publicId: true,
  sender: true,
  senderName: true,
  recipient: true,
  subject: true,
  receivedAt: true,
  readAt: true,
  size: true,
  attachments: {
    select: {
      publicId: true,
      name: true,
      mime: true,
      size: true,
      scanStatus: true,
    },
  },
} as const;
