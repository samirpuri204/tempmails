import { resolveMx, resolveTxt } from "node:dns/promises";
import { db } from "./db";
import { settings } from "./settings";
export async function domainHealth(name: string) {
  const [mx, txt] = await Promise.allSettled([
    resolveMx(name),
    resolveTxt(name),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    mx:
      mx.status === "fulfilled"
        ? mx.value.map((m) => ({ exchange: m.exchange, priority: m.priority }))
        : [],
    spf:
      txt.status === "fulfilled"
        ? txt.value.map((x) => x.join("")).filter((x) => x.startsWith("v=spf1"))
        : [],
    status:
      mx.status === "fulfilled" && mx.value.length
        ? "MX_PRESENT"
        : "MX_MISSING",
  };
}
export async function cleanup() {
  const cfg = await settings();
  const now = new Date(),
    cutoff = new Date(Date.now() - cfg.logRetentionDays * 86400000);
  const [inboxes] = await db.$transaction([
    db.inbox.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.adminSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { lastSeen: { lt: new Date(Date.now() - 30 * 60000) } },
        ],
      },
    }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.loginHistory.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.systemMetric.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.webhookEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.abuseReport.deleteMany({
      where: { createdAt: { lt: cutoff }, status: "RESOLVED" },
    }),
  ]);
  const domains = await db.domain.findMany();
  for (const d of domains) {
    const health = await domainHealth(d.name);
    await db.domain.update({ where: { id: d.id }, data: { health } });
  }
  const abuse = await db.abuseReport.count({ where: { status: "OPEN" } });
  if (
    abuse > 10 &&
    process.env.RESEND_API_KEY &&
    process.env.ALERT_TO &&
    process.env.ALERT_FROM
  ) {
    const key = `alert:${new Date().toISOString().slice(0, 10)}`;
    if (!(await db.webhookEvent.findUnique({ where: { key } }))) {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM,
          to: process.env.ALERT_TO,
          subject: "TempMails: abuse reports need review",
          text: `There are ${abuse} open abuse reports. Sign in to your admin panel to review them.`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (sent.ok)
        await db.webhookEvent.create({ data: { key, status: "ALERT_SENT" } });
    }
  }
  return { deletedInboxes: inboxes.count, domainsChecked: domains.length };
}
