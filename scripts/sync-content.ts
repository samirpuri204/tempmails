// Run with the operator's environment already loaded. Default is read-only.
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { articles } from "../lib/content";
import { postSchema } from "../lib/post-schema";
import { resolvePublication } from "../lib/editorial-publish";

type Manifest = { slug: string; title: string; metaTitle: string; description: string; category: string; author: string; publishedAt: string | null; reviewedAt: string | null; sources: { title: string; url: string }[]; trending: boolean; file: string };
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backupOnly = args.includes("--backup-only");
const expected = args.find(a => a.startsWith("--expect-origin="))?.split("=").slice(1).join("=");
const root = process.cwd();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function main() {
  const origin = new URL(process.env.APP_URL || "").origin;
  if (origin !== "https://tempmails.live") throw new Error("Unexpected APP_URL; refusing to target an unverified site.");
  if ((apply || backupOnly) && expected !== origin) throw new Error("Explicit --expect-origin must match APP_URL.");
  const dbUrl = new URL(process.env.DATABASE_URL || "");
  const target = fingerprint(`${dbUrl.hostname}${dbUrl.pathname}`);
  const manifests: Manifest[] = JSON.parse(await readFile(resolve(root, "content/blog/manifest.json"), "utf8"));
  if (new Set(manifests.map(p => p.slug)).size !== manifests.length) throw new Error("Duplicate article slugs");
  const posts = await Promise.all(manifests.map(async m => {
    if (m.file !== `content/blog/${m.slug}.md`) throw new Error("Unsafe article file path");
    const text = await readFile(resolve(root, m.file), "utf8");
    if (text.split("\n")[0] !== `# ${m.title}`) throw new Error(`H1 mismatch: ${m.slug}`);
    const { file: _file, ...data } = m; void _file;
    // `published` is decided per row by resolvePublication(), not here, so the
    // schema only needs a placeholder that satisfies validation.
    return postSchema.parse({ ...data, body: text.replace(/^# .+\n+/, "").trim(), published: false });
  }));
  const pageSlugs = Object.keys(articles);
  // Raw SELECT is compatible both before and after the additive migration.
  const before = {
    pages: await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "SeoPage" ORDER BY "slug"`,
    posts: await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "BlogPost" ORDER BY "slug"`,
    site: await db.websiteSetting.findUnique({ where: { key: "site" } }),
  };
  if (!before.site) throw new Error("Missing site settings; refusing to create or reset them.");
  const plan = {
    origin,
    databaseFingerprint: target,
    mode: apply ? "apply" : backupOnly ? "backup" : "dry-run",
    pages: pageSlugs,
    posts: posts.map(p => p.slug),
    // Publication is a human action (docs/EDITORIAL.md §1–2). This script only
    // mirrors a manifest date; a null date is written as an unpublished draft.
    publishGate: "published only when manifest.publishedAt is set; no automatic dates",
    draftsStayingDrafts: posts.filter(p => !p.publishedAt).map(p => p.slug),
    clearAnnouncement: true,
    preserveOtherSettings: true,
    beforeDigest: fingerprint(before),
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!apply && !backupOnly) return;
  const dir = resolve(root, ".private-content-backups");
  await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
  const backup = resolve(dir, `content-${Date.now()}.json`);
  await writeFile(backup, JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), origin, databaseFingerprint: target, plan, before }, null, 2), { mode: 0o600, flag: "wx" });
  console.log(`Private backup created: ${backup}`);
  if (backupOnly) return;
  const result = await db.$transaction(async tx => {
    // Fail instead of overwriting an operator edit made after the backup.
    const currentPages = await tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "SeoPage" ORDER BY "slug"`;
    const currentPosts = await tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "BlogPost" ORDER BY "slug"`;
    const currentSite = await tx.websiteSetting.findUnique({ where: { key: "site" } });
    if (fingerprint({ pages: currentPages, posts: currentPosts, site: currentSite }) !== plan.beforeDigest) throw new Error("Content changed after backup; rerun a fresh dry-run.");
    let changedPages = 0; let changedPosts = 0;
    for (const slug of pageSlugs) {
      const content = articles[slug]; const old = await tx.seoPage.findUnique({ where: { slug } });
      const published = old?.published ?? true;
      if (old && old.title === content.title && old.description === content.description && old.body === content.body && JSON.stringify(old.faqs) === JSON.stringify(content.faqs)) continue;
      const data = { ...content, published };
      await tx.seoPage.upsert({ where: { slug }, create: { slug, ...data }, update: data }); changedPages++;
    }
    for (const post of posts) {
      const old = await tx.blogPost.findUnique({ where: { slug: post.slug } });
      // Never publish a draft and never rewrite publication provenance.
      const gate = resolvePublication(post, old);
      const sameDate = (a: Date | null | undefined, b: Date | null) => (a ? a.getTime() : null) === (b ? b.getTime() : null);
      const unchanged = old
        && ["title", "metaTitle", "description", "body", "category", "author", "trending"].every(k => (old as unknown as Record<string, unknown>)[k] === (post as unknown as Record<string, unknown>)[k])
        && JSON.stringify(old.sources) === JSON.stringify(post.sources)
        && old.published === gate.published
        && sameDate(old.publishedAt, gate.publishedAt)
        && sameDate(old.reviewedAt, gate.reviewedAt);
      if (unchanged) continue;
      const data = { ...post, ...gate };
      await tx.blogPost.upsert({ where: { slug: post.slug }, create: data, update: data }); changedPosts++;
    }
    const current = currentSite!.value as Prisma.JsonObject;
    if (current.announcement !== "") await tx.websiteSetting.update({ where: { key: "site" }, data: { value: { ...current, announcement: "" } } });
    return { changedPages, changedPosts };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  const after = await db.websiteSetting.findUnique({ where: { key: "site" } });
  const beforeSettings = { ...(before.site.value as Prisma.JsonObject), announcement: "" };
  if (JSON.stringify(after?.value) !== JSON.stringify(beforeSettings)) throw new Error("Post-write settings comparison failed; inspect the private backup.");
  const summary = { ...result, verifiedAt: new Date().toISOString(), announcementCleared: true, unrelatedSettingsPreserved: true, backup };
  await writeFile(resolve(dir, `receipt-${Date.now()}.json`), JSON.stringify(summary, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "Content sync failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
