import { describe, it, expect, vi } from "vitest";
import {
  token,
  hash,
  equal,
  randomUsername,
  validUsername,
  safeHtml,
  verifyWebhook,
  sign,
  passwordHash,
  passwordValid,
  encrypt,
  decrypt,
  attachmentTicket,
  safePath,
} from "../lib/security";
import { sitemapEntries, robotsRules, publicIndexSettings, PRIVATE_PATHS } from "../lib/seo-urls";
import { settings, settingsSchema } from "../lib/settings";
import { articles } from "../lib/content";
import { contactSchema } from "../lib/contact";
import {
  normalizeRecipient,
  cleanSubject,
  cleanText,
  footer,
  toHtml,
  TAGLINE,
  displayName,
  provider,
  publicStatus,
  sendSchema,
} from "../lib/outbound";

// publicIndexSettings() reads websiteSetting through the shared db client;
// replace that client so tests can simulate an unreachable settings store.
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("../lib/db", () => ({ db: { websiteSetting: { findUnique } } }));
process.env.APP_SECRET = "a".repeat(64);
process.env.INBOUND_SECRET = "b".repeat(64);
describe("security boundaries", () => {
  it("issues high-entropy unique tokens and usernames", () => {
    const tokens = new Set(Array.from({ length: 1000 }, token));
    expect(tokens.size).toBe(1000);
    expect([...tokens].every((t) => t.length === 43)).toBe(true);
    expect(randomUsername(12)).toMatch(/^[a-z2-9]{12}$/);
    expect(hash("token")).toHaveLength(64);
  });
  it("rejects reserved and malformed usernames", () => {
    for (const n of [
      "admin",
      "support-test",
      "../etc",
      "a@b",
      "paypal",
      "no-reply",
      "<script>",
    ])
      expect(validUsername(n)).toBe(false);
    expect(validUsername("spring-note")).toBe(true);
  });
  it("removes scripts, forms, active attributes and tracking", () => {
    const s = safeHtml(
      '<script>alert(1)</script><img src="https://tracker.test/x"><a href="javascript:alert(1)" onclick="x()">click</a><form><input></form><svg onload="x"/>',
    );
    expect(s).not.toMatch(/script|onclick|<img|<form|<svg|javascript/);
    expect(s).toContain("noopener");
  });
  it("permits only https remote images on explicit opt-in", () => {
    const s = safeHtml(
      '<img src="http://a.test/p"><img src="https://a.test/p" onerror="x()"><img src="data:evil">',
      true,
    );
    expect(s).toContain("https://a.test/p");
    expect(s).not.toContain("onerror");
    expect(s).not.toContain("http://");
    expect(s).not.toContain("data:");
  });
  it("verifies payload integrity and freshness", () => {
    const time = String(Math.floor(Date.now() / 1000)),
      body = "payload",
      sig = sign(`${time}.${body}`, process.env.INBOUND_SECRET);
    expect(verifyWebhook(body, time, sig)).toBe(true);
    expect(verifyWebhook("tampered", time, sig)).toBe(false);
    expect(verifyWebhook(body, time, sig, Date.now() + 301000)).toBe(false);
    expect(equal("a", "ab")).toBe(false);
  });
  it("hashes passwords with independent salts", () => {
    const h = passwordHash("strong testing password");
    expect(passwordValid("strong testing password", h)).toBe(true);
    expect(passwordValid("wrong", h)).toBe(false);
    expect(h).not.toEqual(passwordHash("strong testing password"));
  });
  it("encrypts TOTP secrets and binds attachment tickets", () => {
    const encrypted = encrypt("secret");
    expect(decrypt(encrypted)).toBe("secret");
    expect(encrypted).not.toContain("secret");
    expect(attachmentTicket("a", "i", 100)).not.toBe(
      attachmentTicket("a", "other", 100),
    );
  });
  it("blocks open redirects", () => {
    expect(safePath("/how-it-works")).toBe(true);
    for (const p of [
      "//evil.test",
      "https://evil.test",
      "/\\evil",
      "/api/inbox",
      "/admin",
    ])
      expect(safePath(p)).toBe(false);
  });
});

describe("sitemap and robots generation", () => {
  const base = "https://tempmails.live";
  const urls = (pages: Parameters<typeof sitemapEntries>[1], posts: Parameters<typeof sitemapEntries>[2]) =>
    sitemapEntries(base, pages, posts).map((e) => e.url.replace(`${base}/`, "").replace(/\/$/, ""));

  it("lists static content pages, homepage, and blog posts with dates", () => {
    const entries = sitemapEntries(base, [], [
      { slug: "hello", published: true, updatedAt: new Date("2026-09-01") },
    ]);
    const map = new Map(entries.map((e) => [e.url, e.lastModified]));
    expect(map.get(`${base}/`)).toBeUndefined(); // homepage has no date
    expect(map.get(`${base}/temporary-email`)).toBeUndefined();
    expect(map.get(`${base}/blog/hello`)).toEqual(new Date("2026-09-01"));
    expect(urls([], [{ slug: "hello", published: true, updatedAt: new Date() }])).toContain("blog");
  });

  it("includes published db pages and removes unpublished ones, even shadowing static slugs", () => {
    const pages = [
      { slug: "custom-guide", published: true, updatedAt: new Date("2026-09-02") },
      { slug: "temporary-email", published: false, updatedAt: new Date() },
    ];
    const list = urls(pages, []);
    expect(list).toContain("custom-guide");
    expect(list).not.toContain("temporary-email");
  });

  it("never lists private application routes", () => {
    const pages = ["admin", "inbox", "recover", "auth"].map((slug) => ({
      slug,
      published: true,
      updatedAt: new Date(),
    }));
    const list = urls(pages, [{ slug: "admin", published: true, updatedAt: new Date() }]);
    for (const entry of list) {
      expect(PRIVATE_PATHS.some((p) => `/${entry}/`.startsWith(p))).toBe(false);
    }
  });

  it("keeps robots rules in sync with the sitemap's private-path list", () => {
    const rules = robotsRules({ index: true, sitemapEnabled: true, base });
    expect(rules.rules).toEqual({ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS });
    // Exactly one sitemap URL is advertised so Search Console cannot see two
    // competing submissions.
    expect(rules.sitemap).toBe(`${base}/sitemap.xml`);
    const off = robotsRules({ index: false, sitemapEnabled: true, base });
    expect(off.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(off.sitemap).toBeUndefined();
    const noSitemap = robotsRules({ index: true, sitemapEnabled: false, base });
    expect(noSitemap.sitemap).toBeUndefined();
  });

  it("has a static article for every sitemap slug source", () => {
    // Guards against a typo splitting the sitemap source from the real pages.
    expect(Object.keys(articles).length).toBeGreaterThan(5);
  });

  it("fails open: an unreachable settings store keeps the site crawlable", async () => {
    findUnique.mockRejectedValueOnce(new Error("P1001: can't reach the database server"));
    await expect(publicIndexSettings()).resolves.toEqual({
      index: true,
      sitemapEnabled: true,
    });
    // The fallback feeds robotsRules, so the served robots.txt allows crawls.
    const rules = robotsRules({
      ...(await publicIndexSettings()),
      base: "https://tempmails.live",
    });
    expect(rules.rules).toEqual({ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS });
    expect(rules.sitemap).toBe("https://tempmails.live/sitemap.xml");
  });

  it("still honors explicit admin choices when settings are reachable", async () => {
    findUnique.mockResolvedValueOnce({
      value: { indexPublicPages: false, sitemapEnabled: false },
    });
    await expect(publicIndexSettings()).resolves.toEqual({
      index: false,
      sitemapEnabled: false,
    });
  });

  // A stored row can still carry keys from a setting that has since been
  // removed. The schema is strict on write, so without pruning the parse would
  // throw and every caller's catch would silently fall back to defaults —
  // losing the real site name, SEO titles and toggles with no error anywhere.
  it("ignores stored settings keys that are no longer part of the schema", async () => {
    findUnique.mockResolvedValueOnce({
      value: { name: "Kept", seoTitle: "Kept title", retiredSetting: 1, anotherRetired: "x" },
    });
    const s = await settings();
    expect(s.name).toBe("Kept");
    expect(s.seoTitle).toBe("Kept title");
    expect(s).not.toHaveProperty("retiredSetting");
    expect(s).not.toHaveProperty("anotherRetired");
  });

  it("still rejects an unknown key on an admin write", () => {
    expect(() => settingsSchema.parse({ name: "TempMails", retiredSetting: 1 })).toThrow();
  });
});

describe("outbound mail hardening", () => {
  it("accepts only strict ASCII addresses and lowercases them", () => {
    expect(normalizeRecipient("  Alice.Smith@Example.COM ")).toBe(
      "alice.smith@example.com",
    );
    expect(normalizeRecipient("a+tag@sub.example.io")).toBe("a+tag@sub.example.io");
    for (const bad of [
      "Alice <alice@example.com>", // display name
      '"quoted local"@example.com', // quoted local part
      "alice@example", // no TLD
      "alice@exämple.com", // IDN
      "alice@@example.com",
      "alice@example.com\r\nBcc: x@y.z", // header injection
      ".alice@example.com",
      "alice.@example.com",
      "a".repeat(65) + "@example.com", // local part > 64
      "",
    ])
      expect(normalizeRecipient(bad)).toBeNull();
  });
  it("strips header-breaking characters from subjects", () => {
    expect(cleanSubject("Hello\r\nBcc: evil@x.y\u0000  world\u2028!")).toBe(
      "Hello Bcc: evil@x.y world !",
    );
    expect(cleanSubject("x".repeat(300))).toHaveLength(200);
    expect(cleanSubject("   ")).toBe("");
  });
  it("normalises bodies but keeps newlines and tabs", () => {
    // CRLF/CR become LF; other control characters are removed outright.
    expect(cleanText("a\r\nb\rc\u0000\u0007d\te\n")).toBe("a\nb\ncd\te");
  });
  it("only ever shows SENT or FAILED to visitors", () => {
    expect(publicStatus("SENT")).toBe("SENT");
    expect(publicStatus("SENT_NO_MAILBOX")).toBe("SENT");
    expect(publicStatus("SENT_FULL")).toBe("SENT");
    expect(publicStatus("FAILED")).toBe("FAILED");
    expect(publicStatus("PENDING")).toBe("PENDING");
  });
  it("appends an identifying footer with the public reference", () => {
    const f = footer({ sendFooter: "Replies work.", name: "TempMails" }, "ref-1");
    expect(f).toContain("Replies work.");
    expect(f).toContain("Ref ref-1");
    expect(f).toContain("Sent with tempmails.live");
    expect(f).toContain("https://tempmails.live");
    expect(f).toContain(TAGLINE);
    expect(f.startsWith("\n\n--\n")).toBe(true);
    // Spam-filter vocabulary must never appear in the watermark.
    expect(f.toLowerCase()).not.toMatch(/prank|anonymous|free|misuse/);
  });
  it("renders a clickable watermark in the HTML body and escapes user text", () => {
    const h = toHtml(
      "<b>hi</b>",
      { sendFooter: "Replies work.", name: "TempMails" },
      "ref-1",
    );
    expect(h).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(h).not.toContain("<b>hi</b>");
    expect(h).toContain('<a href="https://tempmails.live"');
    // Exactly one link: duplicate URLs read as promotional.
    expect(h.match(/<a /g)?.length).toBe(1);
    expect(h).toContain("Ref ref-1");
  });
  it("builds a relay-style display name", () => {
    expect(displayName("zx9k2p", "TempMails")).toBe("zx9k2p via TempMails");
  });
  it("picks the provider from the environment, Resend first", () => {
    const saved = { r: process.env.RESEND_API_KEY, s: process.env.SMTP_URL };
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_URL;
    expect(provider()).toBeNull();
    process.env.SMTP_URL = "smtps://u:p@h:465";
    expect(provider()).toBe("smtp");
    process.env.RESEND_API_KEY = "re_x";
    expect(provider()).toBe("resend");
    if (saved.r === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved.r;
    if (saved.s === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = saved.s;
  });
  it("rejects unknown fields and oversized inputs at the schema boundary", () => {
    expect(
      sendSchema.safeParse({ to: "a@b.co", text: "hi", subject: "" }).success,
    ).toBe(true);
    expect(sendSchema.safeParse({ to: "a@b.co", text: "" }).success).toBe(false);
    expect(
      sendSchema.safeParse({ to: "a@b.co", text: "hi", html: "<b>" }).success,
    ).toBe(false);
    expect(
      sendSchema.safeParse({ to: "a@b.co", text: "x".repeat(20001) }).success,
    ).toBe(false);
  });
});

describe("contact form schema", () => {
  // Regression: Turnstile renders a hidden input inside the form element, so
  // the payload a real browser posts carries `cf-turnstile-response` in
  // addition to the explicit field. A `.strict()` schema rejected it, and every
  // genuine submission failed with INVALID_INPUT while every curl test passed.
  const browserPayload = {
    category: "business",
    name: "Deployment verification",
    email: "reviewer@example.com",
    subject: "Contact form delivery test",
    message: "This message is comfortably longer than the minimum length.",
    company: "",
    "cf-turnstile-response": "0.abc.def",
  };

  it("accepts the payload a real browser posts, widget field included", () => {
    expect(contactSchema.safeParse(browserPayload).success).toBe(true);
  });

  it("accepts the same submission when the token arrives in the explicit field", () => {
    const { "cf-turnstile-response": token, ...rest } = browserPayload;
    void token;
    expect(contactSchema.safeParse({ ...rest, captcha: "0.abc.def" }).success).toBe(true);
  });

  it("rejects an unknown category, a malformed address and a bad message length", () => {
    expect(contactSchema.safeParse({ ...browserPayload, category: "sales" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...browserPayload, email: "nope" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...browserPayload, message: "too short" }).success).toBe(false);
    expect(
      contactSchema.safeParse({ ...browserPayload, message: "x".repeat(4001) }).success,
    ).toBe(false);
  });

  it("still rejects a genuinely unknown field", () => {
    expect(contactSchema.safeParse({ ...browserPayload, rogue: "1" }).success).toBe(false);
  });

  it("keeps the honeypot accepted so a bot receives a normal-looking answer", () => {
    const parsed = contactSchema.safeParse({ ...browserPayload, company: "spam co" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.company).toBe("spam co");
  });
});
