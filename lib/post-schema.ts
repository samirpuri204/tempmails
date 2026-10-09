import { z } from "zod";
const date = z.union([z.iso.datetime({ offset: true }), z.literal(""), z.null()]).optional().transform(v => v ? new Date(v) : null);
export const postSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(100),
  title: z.string().min(3).max(150),
  metaTitle: z.string().max(60).nullable().optional(),
  description: z.string().max(300),
  body: z.string().min(20).max(50000),
  category: z.string().min(1).max(60).default("Privacy"),
  author: z.string().min(1).max(100).default("TempMails"),
  publishedAt: date,
  reviewedAt: date.refine(v => !v || v <= new Date(), "Review date cannot be in the future"),
  sources: z.array(z.object({ title: z.string().min(1).max(300), url: z.url().refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }) })).max(30).default([]),
  trending: z.boolean().default(false),
  published: z.boolean(),
}).strict();
