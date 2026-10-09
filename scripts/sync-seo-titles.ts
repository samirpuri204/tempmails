// One-off: sync trimmed SEO titles into the production SeoPage rows.
// The seed script uses `update: {}` so it never overwrites existing rows,
// which is why the shortened titles in lib/content.ts and lib/seo-guides.ts
// did not reach production. Only the `title` column is touched.
//
// Run with the production env:
//   node --env-file=.env.production.local --import tsx scripts/sync-seo-titles.ts
import { db } from "../lib/db";
import { articles } from "../lib/content";

const SLUGS = [
  "how-it-works",
  "faq",
  "temp-mail-not-receiving-emails",
  "temporary-email-vs-email-alias",
  "temporary-email-for-testing",
];

async function main() {
  for (const slug of SLUGS) {
    const next = articles[slug]?.title;
    if (!next) {
      console.log(`skip ${slug}: not in lib/content`);
      continue;
    }
    const row = await db.seoPage.findUnique({
      where: { slug },
      select: { title: true },
    });
    if (!row) {
      console.log(`skip ${slug}: no DB row (fallback content already applies)`);
      continue;
    }
    if (row.title === next) {
      console.log(`ok   ${slug}: already "${next}"`);
      continue;
    }
    await db.seoPage.update({ where: { slug }, data: { title: next } });
    console.log(`set  ${slug}: "${row.title}" -> "${next}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
