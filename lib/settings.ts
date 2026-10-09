import { z } from "zod";
import { db } from "./db";
const asset = z
  .string()
  .max(300)
  .refine(
    (x) =>
      !x ||
      x.startsWith("https://") ||
      /^\/(?!\/|api|admin)[a-zA-Z0-9/_.-]+$/.test(x),
  )
  .default("");
const link = z.object({
  label: z.string().max(60),
  url: z
    .string()
    .url()
    .refine((x) => x.startsWith("https://")),
});
export const settingsSchema = z
  .object({
    name: z.string().min(1).max(50).default("TempMails"),
    homepageText: z
      .string()
      .max(300)
      .default("Free temp mail. A private temporary inbox."),
    announcement: z.string().max(300).default(""),
    logo: asset,
    favicon: asset,
    usernameLength: z.number().int().min(8).max(24).default(12),
    customUsernames: z.boolean().default(true),
    retentionMinutes: z.number().int().min(10).max(1440).default(60),
    maxLifetimeMinutes: z.number().int().min(10).max(10080).default(1440),
    maxMessageBytes: z.number().int().min(1024).max(2000000).default(1500000),
    maxAttachmentBytes: z.number().int().min(1024).max(1000000).default(500000),
    maxMessages: z.number().int().min(1).max(500).default(100),
    attachments: z.boolean().default(false),
    maintenance: z.boolean().default(false),
    creationLimit: z.number().int().min(1).max(100).default(10),
    // Outbound mail. Sending stays off until the operator has a verified
    // provider (RESEND_API_KEY or SMTP_URL) and has reviewed the limits.
    sendingEnabled: z.boolean().default(false),
    sendLimitPerInbox: z.number().int().min(1).max(100).default(5),
    sendLimitPerDevice: z.number().int().min(1).max(500).default(20),
    sendLimitPerDay: z.number().int().min(1).max(100000).default(500),
    sendMaxChars: z.number().int().min(100).max(20000).default(4000),
    sendFooter: z
      .string()
      .max(400)
      .default(
        "Replies reach the sender while their inbox is active. Questions about this message can be raised via the contact page.",
      ),
    logRetentionDays: z.number().int().min(1).max(90).default(30),
    languages: z
      .array(z.enum(["en", "ne"]))
      .min(1)
      .default(["en", "ne"]),
    defaultTheme: z.enum(["light", "dark"]).default("light"),
    contactEmail: z.union([z.literal(""), z.email()]).default(""),
    footerLinks: z.array(link).max(15).default([]),
    socialLinks: z.array(link).max(10).default([]),
    ads: z
      .array(
        z.object({
          label: z.string().max(100),
          url: z
            .string()
            .url()
            .refine((x) => x.startsWith("https://")),
        }),
      )
      .max(3)
      .default([]),
    adsenseEnabled: z.boolean().default(false),
    // Homepage: after the inbox card (top), after "how it works" (mid),
    // before the footer (bottom). Articles: under the h1 (articleTop) and
    // after the body (content). See docs/MONETIZATION.md placement map.
    adsenseTopSlot: z
      .string()
      .regex(/^\d{0,20}$/)
      .default(""),
    adsenseMidSlot: z
      .string()
      .regex(/^\d{0,20}$/)
      .default(""),
    adsenseBottomSlot: z
      .string()
      .regex(/^\d{0,20}$/)
      .default(""),
    adsenseArticleTopSlot: z
      .string()
      .regex(/^\d{0,20}$/)
      .default(""),
    adsenseContentSlot: z
      .string()
      .regex(/^\d{0,20}$/)
      .default(""),
    analyticsId: z.string().max(100).default(""),
    searchConsole: z.string().max(100).default(""),
    customScript: z.string().max(20000).default(""),
    scriptsEnabled: z.boolean().default(false),
    seoTitle: z
      .string()
      .max(100)
      .default("Temp Mail — Free Temporary Email Inbox | TempMails"),
    seoDescription: z
      .string()
      .max(200)
      .default(
        "Create a free temp mail address with no signup. Receive temporary emails in a private inbox, save a recovery token, and delete the address when you are done.",
      ),
    ogImage: asset,
    indexPublicPages: z.boolean().default(true),
    sitemapEnabled: z.boolean().default(true),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;

/**
 * Drops stored keys that are no longer part of the schema.
 *
 * The schema is `.strict()` on purpose, so an unrecognised key is a hard error
 * on an *admin write* — that is what catches a typo before it reaches the
 * database. A stored row is a different matter: it can legitimately still carry
 * keys belonging to an integration that has since been removed. Parsing that
 * row strictly would reject the whole object, `settings()` would throw, and
 * every caller's `catch` would quietly fall back to defaults — losing the real
 * site name, SEO titles and toggles with no error anywhere.
 *
 * So: strict on write, tolerant on read. Unknown keys are simply ignored, and
 * the next admin save writes back a row without them.
 */
function withoutUnknownKeys(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const shape = settingsSchema.shape as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([key]) => key in shape),
  );
}

export const defaults = settingsSchema.parse({});
export async function settings() {
  const row = await db.websiteSetting.findUnique({ where: { key: "site" } });
  return settingsSchema.parse(withoutUnknownKeys(row?.value));
}
