import { writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { seoGuides } from "../lib/seo-guides";
import { defaults } from "../lib/settings";

async function main() {
  const previous = await db.websiteSetting.findUnique({
    where: { key: "site" },
  });
  const pages = await db.seoPage.findMany();
  writeFileSync(
    `.env.seo-backup-${Date.now()}.json`,
    JSON.stringify({ previous, pages }, null, 2),
    { mode: 0o600 },
  );
  const value = (previous?.value ?? {}) as Record<string, unknown>;
  await db.$transaction(async (tx) => {
    await tx.websiteSetting.upsert({
      where: { key: "site" },
      create: { key: "site", value: defaults },
      update: {
        value: {
          ...value,
          seoTitle: defaults.seoTitle,
          seoDescription: defaults.seoDescription,
          homepageText: defaults.homepageText,
        },
      },
    });
    for (const [slug, guide] of Object.entries(seoGuides)) {
      await tx.seoPage.upsert({
        where: { slug },
        create: { slug, ...guide, published: true },
        update: {},
      });
    }
    await tx.seoPage.updateMany({
      where: { slug: "how-it-works", title: "Three steps to a cleaner inbox" },
      data: {
        title: "How to Use Temp Mail: Create, Read, and Delete an Inbox",
      },
    });
    await tx.seoPage.updateMany({
      where: { slug: "faq", title: "A few useful answers" },
      data: { title: "Temp Mail FAQ: Delivery, Expiry, Recovery, and Privacy" },
    });
  }, { maxWait: 10000, timeout: 30000 });
  console.log(
    "SEO settings and guides saved; existing custom guide content preserved.",
  );
}
main().finally(() => db.$disconnect());
