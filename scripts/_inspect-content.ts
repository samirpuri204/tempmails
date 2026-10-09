// Read-only inspection of production content rows (no writes).
import { db } from "../lib/db";
import { articles } from "../lib/content";
async function main() {
  const s = await db.websiteSetting.findUnique({ where: { key: "site" } });
  const v = (s?.value ?? {}) as Record<string, unknown>;
  console.log("SETTINGS keys of interest:", JSON.stringify({
    announcement: v.announcement, homepageText: v.homepageText, seoTitle: v.seoTitle,
    seoDescription: v.seoDescription, sendingEnabled: v.sendingEnabled, retentionMinutes: v.retentionMinutes,
    maxLifetimeMinutes: v.maxLifetimeMinutes, attachments: v.attachments, contactEmail: v.contactEmail,
    footerLinks: v.footerLinks, socialLinks: v.socialLinks,
    adsenseEnabled: v.adsenseEnabled, languages: v.languages, searchConsole: v.searchConsole, ogImage: v.ogImage, logo: v.logo,
  }, null, 1));
  const pages = await db.seoPage.findMany();
  for (const p of pages) {
    const code = articles[p.slug];
    const same = code && code.title === p.title && code.body === p.body && code.description === p.description && JSON.stringify(code.faqs) === JSON.stringify(p.faqs);
    console.log(`PAGE ${p.slug} published=${p.published} updated=${p.updatedAt.toISOString()} matchesCode=${!!same} inCode=${!!code}`);
    if (code && !same) {
      if (code.title !== p.title) console.log(`   title DB="${p.title}" CODE="${code.title}"`);
      if (code.body !== p.body) console.log(`   body differs (DB ${p.body.length} chars, code ${code.body.length})`);
      if (code.description !== p.description) console.log(`   desc differs`);
    }
  }
  const posts = await db.blogPost.findMany();
  console.log("POSTS:", posts.map(p => ({ slug: p.slug, published: p.published, title: p.title, created: p.createdAt })));
  const redirects = await db.redirect.findMany();
  console.log("REDIRECTS:", redirects);
  const domains = await db.domain.findMany({ select: { name: true, active: true, selectable: true } });
  console.log("DOMAINS:", domains);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
