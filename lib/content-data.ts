import { cache } from "react";
import { db } from "./db";
import { articles } from "./content";
import { STATIC_CONTENT_UPDATED_AT } from "./editorial";

export const getPage = cache(async (slug: string) => {
  try {
    const page = await db.seoPage.findUnique({ where: { slug } });
    if (page) return page.published ? { ...page, faqs: Array.isArray(page.faqs) ? page.faqs as { question: string; answer: string }[] : [] } : null;
  } catch { /* Static public copy remains available during a database outage. */ }
  return articles[slug] ? { ...articles[slug], updatedAt: STATIC_CONTENT_UPDATED_AT } : null;
});

export const getPost = cache(async (slug: string) => {
  try {
    const post = await db.blogPost.findUnique({ where: { slug } });
    // Future-dated posts stay hidden until their publication date.
    return post?.published && (!post.publishedAt || post.publishedAt <= new Date()) ? post : null;
  } catch {
    // Degrade to "not found" rather than a 500 while the editorial migration is
    // pending or the database is unreachable, so crawlers never see a soft 500.
    return null;
  }
});
