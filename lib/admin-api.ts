import { NextRequest } from "next/server";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import { db } from "./db";
import { adminAuth, audit, permissions } from "./admin";
import {
  ApiError,
  ok,
  json,
  origin,
  rate,
  ipHash,
  cookieOptions,
  redis,
} from "./http";
import {
  hash,
  token,
  passwordValid,
  passwordHash,
  encrypt,
  decrypt,
  safePath,
} from "./security";
import { settings, settingsSchema } from "./settings";
import { cleanup, domainHealth } from "./maintenance";
import { postSchema } from "./post-schema";
const domainSchema = z
  .object({
    name: z
      .string()
      .toLowerCase()
      .regex(
        /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      ),
    active: z.boolean(),
    selectable: z.boolean(),
    maintenance: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict();
const pageSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
    title: z.string().min(3).max(150),
    description: z.string().max(300),
    body: z.string().min(20).max(50000),
    faqs: z
      .array(
        z.object({
          question: z.string().max(300),
          answer: z.string().max(2000),
        }),
      )
      .max(20)
      .default([]),
    published: z.boolean(),
  })
  .strict();
const totp = (secret: string) =>
  new OTPAuth.TOTP({
    issuer: "TempMails",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
type FillCounts = { filled: number; blocked: number; empty: number };

/**
 * Aggregates the ad tag counters the site posts from the browser.
 *
 * They live in Redis rather than Postgres because there is one increment per
 * page view — far too much row churn for a table that is also this site's audit
 * trail. Each day is one hash of `country|placement|outcome`, and the counters
 * expire on their own, so this reads a bounded amount of work and stores nothing
 * per visitor. See docs/MONETIZATION.md §10.
 */
async function adFillReport(days: number) {
  const keys = Array.from(
    { length: days },
    (_, n) =>
      `ads:fill:${new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)}`,
  );
  const maps = await Promise.all(
    keys.map((key) =>
      redis()
        .hgetall(key)
        .catch(() => ({}) as Record<string, string>),
    ),
  );
  const totals: FillCounts = { filled: 0, blocked: 0, empty: 0 };
  const byCountry: Record<string, FillCounts> = {};
  const byPlacement: Record<string, FillCounts> = {};
  const bump = (map: Record<string, FillCounts>, key: string, counts: FillCounts) => {
    const target = (map[key] ??= { filled: 0, blocked: 0, empty: 0 });
    target.filled += counts.filled;
    target.blocked += counts.blocked;
    target.empty += counts.empty;
  };
  for (const map of maps) {
    for (const [field, raw] of Object.entries(map)) {
      const [code, placement, state] = field.split("|");
      const count = Number(raw) || 0;
      if (!count || !(state in totals)) continue;
      const counts = { filled: 0, blocked: 0, empty: 0, [state]: count } as FillCounts;
      totals[state as keyof FillCounts] += count;
      bump(byCountry, code || "XX", counts);
      bump(byPlacement, placement || "unknown", counts);
    }
  }
  const rows = (map: Record<string, FillCounts>) =>
    Object.entries(map)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort(
        (a, b) =>
          b.filled + b.blocked + b.empty - (a.filled + a.blocked + a.empty),
      );
  return { totals, countries: rows(byCountry), placements: rows(byPlacement) };
}

export async function adminApi(req: NextRequest, path: string) {
  const method = req.method;
  if (method !== "GET") origin(req);
  if (path === "login" && method === "POST") {
    await rate(`login:${ipHash(req)}`, 8, 900);
    const b = await json(
      req,
      z
        .object({
          email: z.email().max(254),
          password: z.string().min(1).max(256),
          code: z.string().max(100).optional(),
        })
        .strict(),
    );
    await rate(`account:${hash(b.email.toLowerCase())}`, 10, 900);
    const user = await db.adminUser.findUnique({
      where: { email: b.email.toLowerCase() },
    });
    const valid = passwordValid(
      b.password,
      user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    let verified = !!user && valid && user.active;
    if (verified && user?.totpSecret) {
      const otp = totp(decrypt(user.totpSecret));
      const delta = otp.validate({ token: b.code ?? "", window: 1 });
      if (delta !== null) {
        const step = BigInt(Math.floor(Date.now() / 30000) + delta);
        const updated = await db.adminUser.updateMany({
          where: { id: user.id, lastTotpStep: { lt: step } },
          data: { lastTotpStep: step },
        });
        verified = updated.count === 1;
      } else {
        const recovery = hash(b.code ?? "");
        if (user.recoveryHashes.includes(recovery)) {
          const used = await db.$executeRaw`UPDATE "AdminUser" SET "recoveryHashes" = array_remove("recoveryHashes", ${recovery}) WHERE id = ${user.id} AND ${recovery} = ANY("recoveryHashes")`;
          verified = used === 1;
        } else verified = false;
      }
    }
    await db.loginHistory.create({
      data: {
        accountHash: hash(b.email.toLowerCase()),
        ipHash: ipHash(req),
        success: verified,
      },
    });
    if (!verified || !user)
      throw new ApiError(401, "INVALID_CREDENTIALS_OR_CODE");
    const raw = token();
    await db.adminSession.create({
      data: {
        hash: hash(raw),
        userId: user.id,
        ipHash: ipHash(req),
        expiresAt: new Date(Date.now() + 8 * 3600000),
      },
    });
    await audit(req, user.id, "login", "session");
    const res = ok({ role: user.role });
    res.cookies.set("tm_admin", raw, { ...cookieOptions, maxAge: 8 * 3600 });
    return res;
  }
  const s = await adminAuth(req);
  await rate(`admin:${s.userId}`, 180, 60);
  if (path === "me" && method === "GET")
    return ok({
      email: s.user.email,
      role: s.user.role,
      permissions: permissions[s.user.role],
      twoFactor: !!s.user.totpSecret,
    });
  if (path === "logout" && method === "POST") {
    await db.adminSession.delete({ where: { id: s.id } });
    const r = ok({ loggedOut: true });
    r.cookies.delete("tm_admin");
    return r;
  }
  if (path === "sessions" && method === "GET")
    return ok(
      await db.adminSession.findMany({
        where: { userId: s.userId },
        select: {
          id: true,
          createdAt: true,
          lastSeen: true,
          expiresAt: true,
          ipHash: true,
        },
      }),
    );
  if (path === "sessions" && method === "DELETE") {
    const b = await json(req, z.object({ id: z.uuid() }).strict());
    await db.adminSession.deleteMany({ where: { id: b.id, userId: s.userId } });
    await audit(req, s.userId, "session.revoke", b.id);
    return ok({ revoked: true });
  }
  if (path === "2fa/setup" && method === "POST") {
    const b = await json(req, z.object({ password: z.string().max(256) }));
    if (!passwordValid(b.password, s.user.passwordHash))
      throw new ApiError(401, "INVALID_PASSWORD");
    if (s.user.totpSecret)
      throw new ApiError(409, "TWO_FACTOR_ALREADY_ENABLED");
    const otp = new OTPAuth.TOTP({
      issuer: "TempMails",
      label: s.user.email,
      secret: new OTPAuth.Secret({ size: 20 }),
    });
    await db.adminUser.update({
      where: { id: s.userId },
      data: { pendingTotp: encrypt(otp.secret.base32) },
    });
    return ok({ uri: otp.toString(), secret: otp.secret.base32 });
  }
  if (path === "2fa/enable" && method === "POST") {
    const b = await json(req, z.object({ code: z.string().regex(/^\d{6}$/) }));
    if (
      !s.user.pendingTotp ||
      totp(decrypt(s.user.pendingTotp)).validate({
        token: b.code,
        window: 1,
      }) === null
    )
      throw new ApiError(400, "INVALID_CODE");
    const codes = Array.from({ length: 10 }, () => token().slice(0, 20));
    await db.adminUser.update({
      where: { id: s.userId },
      data: {
        totpSecret: s.user.pendingTotp,
        pendingTotp: null,
        recoveryHashes: codes.map(hash),
      },
    });
    await audit(req, s.userId, "2fa.enable", s.userId);
    return ok({ recoveryCodes: codes });
  }
  if (path === "password" && method === "POST") {
    const b = await json(
      req,
      z
        .object({
          current: z.string().max(256),
          password: z.string().min(14).max(256),
        })
        .strict(),
    );
    if (!passwordValid(b.current, s.user.passwordHash))
      throw new ApiError(401, "INVALID_PASSWORD");
    await db.$transaction([
      db.adminUser.update({
        where: { id: s.userId },
        data: { passwordHash: passwordHash(b.password) },
      }),
      db.adminSession.deleteMany({
        where: { userId: s.userId, id: { not: s.id } },
      }),
    ]);
    await audit(req, s.userId, "password.change", s.userId);
    return ok({ changed: true });
  }
  if (path === "analytics" && method === "GET") {
    const days = z.coerce
      .number()
      .pipe(z.union([z.literal(1), z.literal(7), z.literal(30)]))
      .parse(req.nextUrl.searchParams.get("days") || 7);
    const since = new Date(Date.now() - days * 86400000),
      today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [
      active,
      emailsToday,
      storage,
      attachmentStorage,
      reports,
      metrics,
      domains,
      adsFill,
    ] = await Promise.all([
      db.inbox.count({
        where: { expiresAt: { gt: new Date() }, suspended: false },
      }),
      db.systemMetric.aggregate({
        where: { kind: "mail_received", createdAt: { gte: today } },
        _sum: { value: true },
      }),
      db.message.aggregate({ _sum: { size: true } }),
      db.attachment.aggregate({ _sum: { size: true } }),
      db.abuseReport.count({ where: { status: "OPEN" } }),
      db.systemMetric.findMany({
        where: { createdAt: { gte: since } },
        select: { kind: true, value: true, createdAt: true },
      }),
      db.domain.findMany({
        select: { name: true, active: true, maintenance: true, health: true },
      }),
      adFillReport(days),
    ]);
    const sums: Record<string, number> = {};
    const daily: Record<string, Record<string, number>> = {};
    for (let n = 0; n < days; n++) {
      daily[new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)] =
        {};
    }
    for (const m of metrics) {
      sums[m.kind] = (sums[m.kind] || 0) + m.value;
      const key = m.createdAt.toISOString().slice(0, 10);
      daily[key] ??= {};
      daily[key][m.kind] = (daily[key][m.kind] || 0) + m.value;
    }
    return ok({
      active,
      emailsToday: emailsToday._sum.value || 0,
      storage: storage._sum.size || 0,
      attachmentStorage: attachmentStorage._sum.size || 0,
      reports,
      addressesCreated: await db.addressTombstone.count(),
      sums,
      daily,
      domains,
      adsFill,
      successRate:
        (sums.mail_received || 0) + (sums.mail_failed || 0)
          ? Math.round(
              ((sums.mail_received || 0) /
                ((sums.mail_received || 0) + (sums.mail_failed || 0))) *
                100,
            )
          : null,
    });
  }
  const access = async (p: string) => adminAuth(req, p);
  if (path === "domains") {
    await access("domains");
    if (method === "GET")
      return ok(
        await db.domain.findMany({
          select: {
            name: true,
            active: true,
            selectable: true,
            maintenance: true,
            isDefault: true,
            health: true,
            _count: { select: { inboxes: true } },
          },
        }),
      );
    if (method === "POST") {
      const b = await json(req, domainSchema);
      await db.$transaction(async (tx) => {
        if (b.isDefault)
          await tx.domain.updateMany({ data: { isDefault: false } });
        await tx.domain.upsert({
          where: { name: b.name },
          create: b,
          update: b,
        });
      });
      await audit(req, s.userId, "domain.save", b.name);
      return ok({ saved: true });
    }
    if (method === "DELETE") {
      const b = await json(
        req,
        z
          .object({
            name: z.string(),
            confirmation: z.string(),
            expireInboxes: z.boolean().default(false),
          })
          .strict(),
      );
      if (b.confirmation !== b.name)
        throw new ApiError(400, "CONFIRM_DOMAIN_NAME");
      await db.$transaction(async (tx) => {
        const d = await tx.domain.findUnique({ where: { name: b.name } });
        if (!d) throw new ApiError(404, "NOT_FOUND");
        await tx.$queryRaw`SELECT id FROM "Domain" WHERE id = ${d.id} FOR UPDATE`;
        if (
          (await tx.inbox.count({
            where: { domainId: d.id, expiresAt: { gt: new Date() } },
          })) &&
          !b.expireInboxes
        )
          throw new ApiError(409, "DOMAIN_HAS_ACTIVE_INBOXES");
        await tx.inbox.deleteMany({ where: { domainId: d.id } });
        await tx.domain.delete({ where: { id: d.id } });
      });
      await audit(req, s.userId, "domain.delete", b.name);
      return ok({ deleted: true });
    }
  }
  if (path === "domains/check" && method === "POST") {
    await access("domains");
    const b = await json(
      req,
      z.object({ name: domainSchema.shape.name }).strict(),
    );
    const d = await db.domain.findUnique({ where: { name: b.name } });
    if (!d) throw new ApiError(404, "NOT_FOUND");
    const health = await domainHealth(d.name);
    await db.domain.update({ where: { id: d.id }, data: { health } });
    await audit(req, s.userId, "domain.check", d.name);
    return ok(health);
  }
  if (path === "settings") {
    await access("settings");
    if (method === "GET") {
      const cfg = await settings();
      if (s.user.role !== "OWNER") cfg.customScript = "";
      return ok(cfg);
    }
    if (method === "POST") {
      const b = await json(req, settingsSchema, 40000);
      const old = await settings();
      if (
        s.user.role !== "OWNER" &&
        (b.customScript || b.scriptsEnabled !== old.scriptsEnabled)
      )
        throw new ApiError(403, "OWNER_REQUIRED");
      if (s.user.role !== "OWNER") b.customScript = old.customScript;
      await db.websiteSetting.upsert({
        where: { key: "site" },
        create: { key: "site", value: b },
        update: { value: b },
      });
      await audit(req, s.userId, "settings.save", "site");
      return ok({ saved: true });
    }
  }
  if (["inboxes", "messages"].includes(path) && method === "GET") {
    await access("moderate");
    const q = z
      .object({
        search: z.string().max(100).default(""),
        domain: z.string().max(253).default(""),
        sender: z.string().max(254).default(""),
        recipient: z.string().max(254).default(""),
        ipHash: z.string().max(64).default(""),
        status: z
          .enum(["all", "active", "expired", "suspended"])
          .default("all"),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const inboxWhere = {
      ...(q.domain ? { domain: { name: q.domain } } : {}),
      ...(q.ipHash ? { ipHash: q.ipHash } : {}),
      ...(q.status === "active"
        ? { expiresAt: { gt: new Date() }, suspended: false }
        : q.status === "expired"
          ? { expiresAt: { lte: new Date() } }
          : q.status === "suspended"
            ? { suspended: true }
            : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    if (path === "inboxes")
      return ok(
        await db.inbox.findMany({
          where: {
            ...inboxWhere,
            username: { contains: q.search, mode: "insensitive" },
          },
          select: {
            publicId: true,
            username: true,
            domain: { select: { name: true } },
            expiresAt: true,
            createdAt: true,
            suspended: true,
            ipHash: true,
            _count: { select: { messages: true } },
          },
          take: 50,
          skip: (q.page - 1) * 50,
          orderBy: { createdAt: "desc" },
        }),
      );
    return ok(
      await db.message.findMany({
        where: {
          inbox: inboxWhere,
          subject: { contains: q.search, mode: "insensitive" },
          sender: { contains: q.sender, mode: "insensitive" },
          recipient: { contains: q.recipient, mode: "insensitive" },
        },
        select: {
          publicId: true,
          sender: true,
          recipient: true,
          subject: true,
          size: true,
          receivedAt: true,
        },
        take: 50,
        skip: (q.page - 1) * 50,
        orderBy: { receivedAt: "desc" },
      }),
    );
  }
  if (
    ["inboxes", "messages"].includes(path) &&
    ["DELETE", "PATCH"].includes(method)
  ) {
    await access("moderate");
    const b = await json(
      req,
      z
        .object({ publicId: z.uuid(), suspended: z.boolean().optional() })
        .strict(),
    );
    if (path === "inboxes") {
      if (method === "DELETE")
        await db.inbox.delete({ where: { publicId: b.publicId } });
      else
        await db.inbox.update({
          where: { publicId: b.publicId },
          data: { suspended: b.suspended ?? true },
        });
    } else if (method === "DELETE")
      await db.message.delete({ where: { publicId: b.publicId } });
    else throw new ApiError(405, "METHOD_NOT_ALLOWED");
    await audit(req, s.userId, `${path}.${method.toLowerCase()}`, b.publicId);
    return ok({ saved: true });
  }
  if (path === "outbound" && method === "GET") {
    await access("moderate");
    const q = z
      .object({
        search: z.string().max(100).default(""),
        sender: z.string().max(254).default(""),
        recipient: z.string().max(254).default(""),
        ipHash: z.string().max(64).default(""),
        status: z.string().max(20).default(""),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return ok(
      await db.outboundMessage.findMany({
        where: {
          subject: { contains: q.search, mode: "insensitive" },
          sender: { contains: q.sender, mode: "insensitive" },
          recipient: { contains: q.recipient, mode: "insensitive" },
          ...(q.ipHash ? { ipHash: q.ipHash } : {}),
          ...(q.status && q.status !== "all"
            ? { status: { startsWith: q.status.toUpperCase() } }
            : {}),
          ...(q.from || q.to
            ? {
                createdAt: {
                  ...(q.from ? { gte: new Date(q.from) } : {}),
                  ...(q.to ? { lte: new Date(q.to) } : {}),
                },
              }
            : {}),
        },
        select: {
          publicId: true,
          sender: true,
          recipient: true,
          subject: true,
          size: true,
          delivery: true,
          status: true,
          error: true,
          ipHash: true,
          createdAt: true,
          inbox: { select: { publicId: true, suspended: true } },
        },
        take: 50,
        skip: (q.page - 1) * 50,
        orderBy: { createdAt: "desc" },
      }),
    );
  }
  if (path === "cleanup" && method === "POST") {
    await access("moderate");
    const result = await cleanup();
    await audit(req, s.userId, "cleanup", "expired");
    return ok(result);
  }
  if (path === "blocklist") {
    await access("moderate");
    if (method === "GET")
      return ok(
        await db.blocklist.findMany({
          select: { kind: true, value: true, createdAt: true },
        }),
      );
    const b = await json(
      req,
      z
        .object({
          kind: z.enum([
            "sender",
            "domain",
            "keyword",
            "extension",
            "username",
          ]),
          value: z
            .string()
            .min(1)
            .max(254)
            .transform((x) => x.toLowerCase()),
        })
        .strict(),
    );
    if (method === "POST")
      await db.blocklist.upsert({
        where: { kind_value: b },
        create: b,
        update: {},
      });
    else if (method === "DELETE") await db.blocklist.deleteMany({ where: b });
    else throw new ApiError(405, "METHOD_NOT_ALLOWED");
    await audit(req, s.userId, `blocklist.${method.toLowerCase()}`, b.kind);
    return ok({ saved: true });
  }
  if (path === "reports") {
    await access("moderate");
    if (method === "GET")
      return ok(
        await db.abuseReport.findMany({
          take: 100,
          orderBy: { createdAt: "desc" },
        }),
      );
    if (method === "PATCH") {
      const b = await json(
        req,
        z.object({ id: z.uuid(), status: z.enum(["OPEN", "RESOLVED"]) }),
      );
      await db.abuseReport.update({
        where: { id: b.id },
        data: { status: b.status },
      });
      await audit(req, s.userId, "report.status", b.id);
      return ok({ saved: true });
    }
  }
  if (["pages", "posts"].includes(path)) {
    await access("content");
    if (method === "GET")
      return ok(
        path === "pages"
          ? await db.seoPage.findMany()
          : await db.blogPost.findMany(),
      );
    if (method === "POST") {
      let slug: string;
      if (path === "pages") {
        const b = await json(req, pageSchema, 60000);
        slug = b.slug;
        await db.seoPage.upsert({ where: { slug }, create: b, update: b });
      } else {
        const post = await json(req, postSchema, 65000);
        slug = post.slug;
        const old = await db.blogPost.findUnique({ where: { slug } });
        const publishedAt = post.publishedAt ?? old?.publishedAt ?? (post.published ? new Date() : null);
        const data = { ...post, publishedAt };
        await db.blogPost.upsert({ where: { slug }, create: data, update: data });
      }
      await audit(req, s.userId, `${path}.save`, slug);
      return ok({ saved: true });
    }
    if (method === "DELETE") {
      const b = await json(req, z.object({ slug: z.string().max(100) }));
      if (path === "pages")
        await db.seoPage.delete({ where: { slug: b.slug } });
      else await db.blogPost.delete({ where: { slug: b.slug } });
      await audit(req, s.userId, `${path}.delete`, b.slug);
      return ok({ deleted: true });
    }
  }
  if (path === "redirects") {
    await access("content");
    if (method === "GET") return ok(await db.redirect.findMany());
    const b = await json(
      req,
      z.object({
        source: z.string().refine(safePath),
        destination: z.string().refine(safePath),
        permanent: z.boolean(),
      }),
    );
    if (b.source === b.destination) throw new ApiError(400, "REDIRECT_LOOP");
    if (method === "POST") {
      let dest = b.destination;
      for (let n = 0; n < 20; n++) {
        if (dest === b.source) throw new ApiError(400, "REDIRECT_LOOP");
        const r = await db.redirect.findUnique({ where: { source: dest } });
        if (!r) break;
        dest = r.destination;
        if (n === 19) throw new ApiError(400, "REDIRECT_CHAIN_TOO_LONG");
      }
      await db.redirect.upsert({
        where: { source: b.source },
        create: b,
        update: b,
      });
    } else if (method === "DELETE")
      await db.redirect.delete({ where: { source: b.source } });
    await audit(req, s.userId, "redirect.save", b.source);
    return ok({ saved: true });
  }
  if (path === "users") {
    await access("users");
    if (method === "GET")
      return ok(
        await db.adminUser.findMany({
          select: {
            id: true,
            email: true,
            role: true,
            active: true,
            createdAt: true,
          },
        }),
      );
    if (method === "POST") {
      const b = await json(
        req,
        z.object({
          email: z.email(),
          role: z.enum([
            "OWNER",
            "ADMINISTRATOR",
            "EDITOR",
            "SUPPORT",
            "VIEWER",
          ]),
          active: z.boolean(),
          password: z.string().min(14).max(256).optional(),
        }),
      );
      const old = await db.adminUser.findUnique({
        where: { email: b.email.toLowerCase() },
      });
      if (old?.id === s.userId && (!b.active || b.role !== "OWNER"))
        throw new ApiError(409, "CANNOT_REMOVE_OWN_ACCESS");
      if (!old && !b.password) throw new ApiError(400, "PASSWORD_REQUIRED");
      await db.adminUser.upsert({
        where: { email: b.email.toLowerCase() },
        create: {
          email: b.email.toLowerCase(),
          role: b.role,
          active: b.active,
          passwordHash: old?.passwordHash ?? passwordHash(b.password!),
        },
        update: {
          role: b.role,
          active: b.active,
          ...(b.password ? { passwordHash: passwordHash(b.password) } : {}),
        },
      });
      if (old) await db.adminSession.deleteMany({ where: { userId: old.id } });
      await audit(req, s.userId, "user.save", hash(b.email.toLowerCase()));
      return ok({ saved: true });
    }
  }
  if (path === "audit" && method === "GET") {
    await access("settings");
    return ok(
      await db.auditLog.findMany({ take: 200, orderBy: { createdAt: "desc" } }),
    );
  }
  if (path === "login-history" && method === "GET") {
    await access("settings");
    return ok(
      await db.loginHistory.findMany({
        take: 100,
        orderBy: { createdAt: "desc" },
      }),
    );
  }
  // Ad host reachability, measured in the owner's browser. The reading is
  // stored because the only session that can produce it is the one the owner is
  // sitting in — and "it still does not work" is much easier to answer against
  // the numbers that were on screen than against a description of them.
  // Aggregate readings only: a host, an outcome, a status, a size, a time.
  if (path === "ads-probe") {
    await access("read");
    if (method === "POST") {
      const b = await json(
        req,
        z
          .object({
            results: z
              .array(
                z
                  .object({
                    url: z.string().max(300),
                    outcome: z.enum(["ok", "error", "opaque", "silent"]),
                    status: z.number().int().nullable(),
                    bytes: z.number().int().nullable(),
                    ms: z.number().int().nullable(),
                  })
                  .strict(),
              )
              .max(10),
          })
          .strict(),
        4096,
      );
      try {
        await redis().set(
          "ads:probe:last",
          JSON.stringify({
            at: new Date().toISOString(),
            country: (
              req.headers.get("x-vercel-ip-country") || "XX"
            ).toUpperCase(),
            results: b.results,
          }),
          "EX",
          604800,
        );
      } catch {
        // A failed write must never fail the check itself.
      }
      return ok({ saved: true });
    }
    if (method === "GET") {
      try {
        return ok(JSON.parse((await redis().get("ads:probe:last")) || "null"));
      } catch {
        return ok(null);
      }
    }
  }
  throw new ApiError(404, "NOT_FOUND");
}
