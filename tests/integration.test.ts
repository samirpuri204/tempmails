import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import * as OTPAuth from "otpauth";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { POST, GET, DELETE } from "../app/api/[...path]/route";
import { sign, passwordHash, hash, token } from "../lib/security";
import { redis } from "../lib/http";
const db = new PrismaClient();
const app = process.env.APP_URL || "http://localhost:3000";
let cookie = "",
  recovery = "",
  address = "",
  messageId = "";
let adminCookie = "";
function request(
  path: string,
  method = "GET",
  body?: unknown,
  auth = cookie,
  extra: Record<string, string> = {},
) {
  return new NextRequest(`${app}/api/${path}`, {
    method,
    headers: {
      origin: app,
      ...(auth ? { cookie: auth } : {}),
      "Content-Type": "application/json",
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const payload = (recipient: string, id = "test-event") => ({
  provider: "custom",
  eventId: id,
  recipient,
  raw: Buffer.from(
    `From: Test Sender <sender@example.test>\r\nTo: spoofed@example.test\r\nSubject: Integration delivery\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello inbox</p><script>alert(1)</script><img src="https://tracker.example/p">`,
  ).toString("base64"),
});
async function inbound(body: unknown) {
  const raw = JSON.stringify(body),
    timestamp = String(Math.floor(Date.now() / 1000));
  return POST(
    request("inbound", "POST", body, "", {
      "x-mail-timestamp": timestamp,
      "x-mail-signature": sign(
        `${timestamp}.${raw}`,
        process.env.INBOUND_SECRET!,
      ),
    }),
  );
}
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("tempmails_test"))
    throw new Error(
      "Integration tests require isolated database named tempmails_test",
    );
  await db.inbox.deleteMany();
  await db.domain.deleteMany();
  await db.addressTombstone.deleteMany();
  await db.webhookEvent.deleteMany();
  await db.adminUser.deleteMany();
  await db.websiteSetting.deleteMany();
  await redis().flushdb();
  await db.domain.create({
    data: { name: "example.test", active: true, isDefault: true },
  });
  await db.adminUser.create({
    data: {
      email: "owner@example.test",
      passwordHash: passwordHash("integration password long"),
      role: "OWNER",
    },
  });
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  redis().disconnect();
});
describe.sequential("real PostgreSQL + Redis application flow", () => {
  it("creates a private address and sets an HttpOnly cookie", async () => {
    const r = await POST(request("inbox", "POST", {}, ""));
    expect(r.status).toBe(201);
    const d = (await r.json()).data;
    expect(d.address).toMatch(/@example.test$/);
    expect(d.recoveryToken).toHaveLength(43);
    expect(d.id).toBeUndefined();
    address = d.address;
    recovery = d.recoveryToken;
    const set = r.headers.get("set-cookie")!;
    expect(set).toContain("HttpOnly");
    expect(set.toLowerCase()).toContain("samesite=strict");
    cookie = set.match(/tm_inbox=[^;]+/)![0];
  });
  it("preserves an inbox on repeated initialization", async () => {
    const r = await POST(request("inbox", "POST", {}));
    expect(r.status).toBe(200);
    expect((await r.json()).data.address).toBe(address);
    expect(await db.inbox.count()).toBe(1);
  });
  it("rejects cross-origin creation", async () => {
    const r = await POST(
      request("inbox", "POST", {}, "", { origin: "https://evil.test" }),
    );
    expect(r.status).toBe(403);
  });
  it("rejects unsigned inbound mail", async () => {
    expect(
      (await POST(request("inbound", "POST", payload(address)))).status,
    ).toBe(401);
  });
  it("receives signed MIME and deduplicates retries", async () => {
    expect((await inbound(payload(address))).status).toBe(200);
    expect((await inbound(payload(address))).status).toBe(200);
    expect(await db.message.count()).toBe(1);
    const r = await GET(request("messages"));
    const d = (await r.json()).data;
    expect(d.total).toBe(1);
    expect(d.unread).toBe(1);
    messageId = d.messages[0].publicId;
    expect(d.messages[0].recipient).toBe(address);
  });
  it("protects messages from another visitor", async () => {
    expect((await GET(request("messages", "GET", undefined, ""))).status).toBe(
      401,
    );
    const r = await POST(
      request("inbox", "POST", { username: "another-user" }, ""),
    );
    const other = r.headers.get("set-cookie")!.match(/tm_inbox=[^;]+/)![0];
    expect(
      (await GET(request(`messages/${messageId}`, "GET", undefined, other)))
        .status,
    ).toBe(404);
  });
  it("requires a fresh CAPTCHA for a custom inbox and routes mail to that exact address", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "integration-only-secret");
    const verify = vi.spyOn(globalThis, "fetch");
    try {
      const body = { username: "custom-delivery", domain: "example.test" };
      const missing = await POST(request("inbox", "POST", body));
      expect(missing.status).toBe(403);
      expect((await missing.json()).error.code).toBe("CAPTCHA_REQUIRED");
      expect(verify).not.toHaveBeenCalled();
      verify.mockResolvedValueOnce(Response.json({ success: false }));
      const invalid = await POST(request("inbox", "POST", { ...body, captcha: "used-token" }));
      expect(invalid.status).toBe(403);
      expect((await invalid.json()).error.code).toBe("CAPTCHA_FAILED");
      verify.mockResolvedValueOnce(Response.json({
        success: true, hostname: new URL(app).hostname, action: "create-inbox",
      }));
      const created = await POST(request("inbox", "POST", { ...body, captcha: "fresh-token" }));
      expect(created.status).toBe(201);
      expect((await created.json()).data.address).toBe("custom-delivery@example.test");
      expect(String(verify.mock.calls[1][1]?.body)).toContain("response=fresh-token");
      const customCookie = created.headers.get("set-cookie")!.match(/tm_inbox=[^;]+/)![0];
      expect((await inbound(payload("custom-delivery@example.test", "custom-delivery-event"))).status).toBe(200);
      const messages = (await (await GET(request("messages", "GET", undefined, customCookie))).json()).data;
      expect(messages.total).toBe(1);
      expect(messages.messages[0].recipient).toBe("custom-delivery@example.test");
      expect(messages.messages[0].subject).toBe("Integration delivery");
      // Replacing the browser's address never deletes its recoverable old inbox.
      expect((await (await GET(request("inbox"))).json()).data.address).toBe(address);
    } finally {
      verify.mockRestore();
      vi.unstubAllEnvs();
      await db.inbox.deleteMany({ where: { username: "custom-delivery" } });
    }
  });
  it("sanitizes formatted mail and records read state", async () => {
    const r = await GET(request(`messages/${messageId}`));
    const m = (await r.json()).data;
    expect(m.html).toContain("Hello inbox");
    expect(m.html).not.toContain("<script");
    expect(m.html).not.toContain("<img");
    expect(
      (await db.message.findUnique({ where: { publicId: messageId } }))?.readAt,
    ).not.toBeNull();
  });
  it("restores access and revokes the previous token", async () => {
    const old = cookie;
    const r = await POST(request("restore", "POST", { token: recovery }, ""));
    expect(r.status).toBe(200);
    cookie = r.headers.get("set-cookie")!.match(/tm_inbox=[^;]+/)![0];
    expect((await GET(request("messages", "GET", undefined, old))).status).toBe(
      401,
    );
    expect((await GET(request("messages"))).status).toBe(200);
  });
  it("extends active expiry and keeps the restored browser session alive", async () => {
    const before = (await db.inbox.findFirst({
      where: { username: address.split("@")[0] },
    }))!.expiresAt;
    const r = await POST(request("inbox/extend", "POST"));
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("tm_inbox=");
    expect(new Date((await r.json()).data.expiresAt).getTime()).toBeGreaterThan(
      before.getTime(),
    );
  });
  it("binds short-lived attachment downloads to the owner", async () => {
    const message = await db.message.findUniqueOrThrow({
      where: { publicId: messageId },
    });
    const a = await db.attachment.create({
      data: {
        messageId: message.id,
        name: "checked.pdf",
        mime: "application/pdf",
        size: 5,
        bytes: Buffer.from("%PDF-"),
        scanStatus: "CLEAN",
      },
    });
    const r = await POST(request(`attachments/${a.publicId}/ticket`, "POST"));
    expect(r.status).toBe(200);
    const url = (await r.json()).data.url.replace("/api/", "");
    expect((await GET(request(url))).status).toBe(200);
    expect((await GET(request(url, "GET", undefined, ""))).status).toBe(401);
    expect(
      (await GET(request(url.replace(/signature=[a-f0-9]+/, "signature=bad"))))
        .status,
    ).toBe(403);
  });
  it("deletes a single message", async () => {
    expect(
      (await DELETE(request(`messages/${messageId}`, "DELETE"))).status,
    ).toBe(200);
    expect(await db.message.count()).toBe(0);
  });
  it("enforces admin login and roles on the server", async () => {
    expect(
      (await GET(request("admin/analytics", "GET", undefined, ""))).status,
    ).toBe(401);
    const login = await POST(
      request(
        "admin/login",
        "POST",
        { email: "owner@example.test", password: "integration password long" },
        "",
      ),
    );
    expect(login.status).toBe(200);
    adminCookie = login.headers.get("set-cookie")!.match(/tm_admin=[^;]+/)![0];
    expect(
      (await GET(request("admin/analytics", "GET", undefined, adminCookie)))
        .status,
    ).toBe(200);
    const viewer = await db.adminUser.create({
      data: {
        email: "viewer@example.test",
        passwordHash: passwordHash("viewer password long"),
        role: "VIEWER",
      },
    });
    const raw = token();
    await db.adminSession.create({
      data: {
        userId: viewer.id,
        hash: hash(raw),
        ipHash: "test",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      (await POST(request("admin/domains", "POST", {}, `tm_admin=${raw}`)))
        .status,
    ).toBe(403);
  });
  it("enrolls TOTP and atomically consumes recovery codes", async () => {
    const setup = await POST(
      request(
        "admin/2fa/setup",
        "POST",
        { password: "integration password long" },
        adminCookie,
      ),
    );
    expect(setup.status).toBe(200);
    const secret = (await setup.json()).data.secret;
    const otp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const enabled = await POST(
      request(
        "admin/2fa/enable",
        "POST",
        { code: otp.generate() },
        adminCookie,
      ),
    );
    expect(enabled.status).toBe(200);
    const codes = (await enabled.json()).data.recoveryCodes;
    const login = (code: string) =>
      POST(
        request(
          "admin/login",
          "POST",
          {
            email: "owner@example.test",
            password: "integration password long",
            code,
          },
          "",
        ),
      );
    const results = await Promise.all([login(codes[0]), login(codes[1])]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const owner = await db.adminUser.findUniqueOrThrow({
      where: { email: "owner@example.test" },
    });
    expect(owner.recoveryHashes).not.toContain(hash(codes[0]));
    expect(owner.recoveryHashes).not.toContain(hash(codes[1]));
    expect((await login(codes[0])).status).toBe(401);
  });
  it("requires confirmation and protects domains with active inboxes", async () => {
    const r = await DELETE(
      request(
        "admin/domains",
        "DELETE",
        { name: "example.test", confirmation: "example.test" },
        adminCookie,
      ),
    );
    expect(r.status).toBe(409);
  });
  it("rejects expired access, recovery and delivery", async () => {
    await db.inbox.updateMany({
      where: { username: address.split("@")[0] },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await GET(request("messages"))).status).toBe(410);
    expect(
      (await POST(request("restore", "POST", { token: recovery }, ""))).status,
    ).toBe(404);
    expect((await inbound(payload(address, "expired-event"))).status).toBe(410);
  });
  it("cascades inbox deletion and does not reissue addresses", async () => {
    const created = await POST(
      request("inbox", "POST", { username: "deletion-check" }, ""),
    );
    const c = created.headers.get("set-cookie")!.match(/tm_inbox=[^;]+/)![0];
    expect(
      (await inbound(payload("deletion-check@example.test", "deletion-event")))
        .status,
    ).toBe(200);
    expect(
      (await DELETE(request("inbox", "DELETE", undefined, c))).status,
    ).toBe(200);
    expect(
      await db.message.count({
        where: { recipient: "deletion-check@example.test" },
      }),
    ).toBe(0);
    expect(
      (await POST(request("inbox", "POST", { username: "deletion-check" }, "")))
        .status,
    ).toBe(409);
  });
});
