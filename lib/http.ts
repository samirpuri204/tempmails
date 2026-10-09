import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Redis from "ioredis";
import { hash, sign } from "./security";
import { db } from "./db";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const globalRedis = globalThis as unknown as { redis?: Redis };
export function redis() {
  if (!process.env.REDIS_URL) throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return (globalRedis.redis ??= new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: true,
  }));
}
export function ipHash(req: NextRequest) {
  const ip =
    process.env.TRUST_PROXY === "true"
      ? (req.headers.get("x-real-ip") ?? "unknown")
      : "local";
  return sign(ip);
}
export async function metric(kind: string, value = 1) {
  await db.systemMetric.create({ data: { kind, value } });
}
export async function rate(key: string, limit: number, seconds: number) {
  const count = Number(
    await redis().eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      `rate:${hash(key)}`,
      seconds,
    ),
  );
  if (count > limit) {
    await metric("blocked");
    throw new ApiError(429, "TOO_MANY_REQUESTS");
  }
}
// Read-only check: rejects when the window is already full but does not
// consume a slot. Pair with `consume` after the action actually succeeds so
// failed attempts (captcha, taken username, validation) never count.
export async function check(key: string, limit: number) {
  const count = Number((await redis().get(`rate:${hash(key)}`)) || 0);
  if (count >= limit) {
    await metric("blocked");
    throw new ApiError(429, "TOO_MANY_REQUESTS");
  }
}
export async function consume(key: string, seconds: number) {
  await redis()
    .eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      `rate:${hash(key)}`,
      seconds,
    )
    .catch(() => {});
}
export function origin(req: NextRequest) {
  if (
    req.headers.get("origin") !==
    new URL(process.env.APP_URL || "http://localhost:3000").origin
  )
    throw new ApiError(403, "INVALID_ORIGIN");
}
export async function bodyText(req: NextRequest, max = 32768) {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new ApiError(413, "REQUEST_TOO_LARGE");
  const reader = req.body?.getReader();
  if (!reader) return "";
  let n = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    n += r.value.length;
    if (n > max) {
      await reader.cancel();
      throw new ApiError(413, "REQUEST_TOO_LARGE");
    }
    chunks.push(r.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function json<T>(
  req: NextRequest,
  schema: z.ZodType<T>,
  max = 32768,
) {
  let b;
  try {
    b = JSON.parse(await bodyText(req, max));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "INVALID_JSON");
  }
  return schema.parse(b);
}
export const ok = (data: unknown, status = 200) =>
  NextResponse.json(
    { data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
export function route(fn: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof z.ZodError)
        return NextResponse.json(
          {
            error: {
              code: "INVALID_INPUT",
              message: "Please check the supplied values.",
            },
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      const known = e instanceof ApiError;
      const code = known ? e.code : "SERVICE_UNAVAILABLE";
      if (!known) {
        console.error(
          JSON.stringify({
            level: "error",
            code: "REQUEST_FAILED",
            at: new Date().toISOString(),
          }),
        );
        await metric("api_error").catch(() => {});
        if (process.env.ERROR_MONITOR_URL)
          await fetch(process.env.ERROR_MONITOR_URL, {
            method: "POST",
            body: JSON.stringify({
              code: "REQUEST_FAILED",
              at: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(2000),
          }).catch(() => {});
      }
      return NextResponse.json(
        { error: { code, message: code.toLowerCase().replaceAll("_", " ") } },
        {
          status: known ? e.status : 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow",
          },
        },
      );
    }
  };
}
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};
export async function bot(
  req: NextRequest,
  response?: string,
  action = "create-inbox",
) {
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.TURNSTILE_SECRET_KEY
  )
    return;
  if (!process.env.TURNSTILE_SECRET_KEY)
    throw new ApiError(503, "BOT_PROTECTION_UNAVAILABLE");
  if (!response) throw new ApiError(403, "CAPTCHA_REQUIRED");
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response,
      }),
      signal: AbortSignal.timeout(5000),
    },
  );
  const data = await res.json();
  if (
    !data.success ||
    data.hostname !== new URL(process.env.APP_URL!).hostname ||
    data.action !== action
  )
    throw new ApiError(403, "CAPTCHA_FAILED");
}
