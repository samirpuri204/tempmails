import { NextRequest } from "next/server";
import { z } from "zod";
import { route, ok, ApiError, bodyText, redis, metric } from "@/lib/http";
import { verifyWebhook, equal, secret } from "@/lib/security";
import { receiveMail } from "@/lib/mail";
import { publicApi } from "@/lib/public-api";
import { adminApi } from "@/lib/admin-api";
import { cleanup } from "@/lib/maintenance";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handler = route(async (req: NextRequest) => {
  const path = req.nextUrl.pathname.replace(/^\/api\//, "");
  if (path === "health" && req.method === "GET") {
    await db.$queryRaw`SELECT 1`;
    await redis().ping();
    return ok({ status: "ok" });
  }
  if (path === "inbound" && req.method === "POST") {
    const raw = await bodyText(req, 2900000);
    if (
      !verifyWebhook(
        raw,
        req.headers.get("x-mail-timestamp") || "",
        req.headers.get("x-mail-signature") || "",
      )
    )
      throw new ApiError(401, "INVALID_SIGNATURE");
    const b = z
      .object({
        provider: z.enum(["cloudflare", "custom"]),
        eventId: z.string().min(1).max(300),
        recipient: z.email(),
        raw: z
          .string()
          .max(2800000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .strict()
      .parse(JSON.parse(raw));
    try {
      return ok(await receiveMail(b));
    } catch (e) {
      await metric("mail_failed").catch(() => {});
      throw e;
    }
  }
  if (path === "cron/cleanup" && ["GET", "POST"].includes(req.method)) {
    if (
      !equal(
        req.headers.get("authorization") || "",
        `Bearer ${secret("CRON_SECRET")}`,
      )
    )
      throw new ApiError(401, "UNAUTHORIZED");
    return ok(await cleanup());
  }
  if (path.startsWith("admin/")) return adminApi(req, path.slice(6));
  return publicApi(req, path);
});
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
