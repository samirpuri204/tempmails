import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "./db";
import { hash } from "./security";
import { ApiError, ipHash } from "./http";
export const permissions: Record<Role, string[]> = {
  OWNER: [
    "read",
    "domains",
    "moderate",
    "content",
    "settings",
    "users",
    "scripts",
  ],
  ADMINISTRATOR: ["read", "domains", "moderate", "content", "settings"],
  EDITOR: ["read", "content"],
  SUPPORT: ["read", "moderate"],
  VIEWER: ["read"],
};
export async function adminAuth(req: NextRequest, permission = "read") {
  const raw = req.cookies.get("tm_admin")?.value;
  if (!raw) throw new ApiError(401, "LOGIN_REQUIRED");
  const s = await db.adminSession.findUnique({
    where: { hash: hash(raw) },
    include: { user: true },
  });
  if (
    !s ||
    !s.user.active ||
    s.expiresAt <= new Date() ||
    Date.now() - s.lastSeen.getTime() > 30 * 60000
  )
    throw new ApiError(401, "LOGIN_REQUIRED");
  if (!permissions[s.user.role].includes(permission))
    throw new ApiError(403, "FORBIDDEN");
  await db.adminSession.update({
    where: { id: s.id },
    data: { lastSeen: new Date() },
  });
  return s;
}
export async function audit(
  req: NextRequest,
  actor: string,
  action: string,
  target: string,
) {
  await db.auditLog.create({
    data: { actor, action, target, ipHash: ipHash(req) },
  });
}
