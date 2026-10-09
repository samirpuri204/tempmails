import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import sanitizeHtml from "sanitize-html";
export const token = () => randomBytes(32).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function secret(name = "APP_SECRET") {
  const s = process.env[name];
  if (!s || s.length < 32) throw new Error(`CONFIG_${name}`);
  return s;
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const sign = (s: string, key = secret()) =>
  createHmac("sha256", key).update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordValid(password: string, stored: string) {
  const [salt, h] = stored.split(":");
  return (
    !!salt && !!h && equal(scryptSync(password, salt, 64).toString("hex"), h)
  );
}
export function encrypt(s: string) {
  const iv = randomBytes(12),
    c = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret()).digest(),
      iv,
    );
  return Buffer.concat([iv, c.update(s), c.final(), c.getAuthTag()]).toString(
    "base64url",
  );
}
export function decrypt(s: string) {
  const b = Buffer.from(s, "base64url"),
    d = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret()).digest(),
      b.subarray(0, 12),
    );
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
}
export const randomUsername = (length: number) => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length)) {
      if (
        b < Math.floor(256 / alphabet.length) * alphabet.length &&
        out.length < length
      )
        out += alphabet[b % alphabet.length];
    }
  }
  return out;
};
const reserved =
  /^(admin|administrator|support|security|postmaster|abuse|root|webmaster|mail|noreply|no-reply|owner|tempmails|billing|paypal|bank|google|microsoft|apple|fuck|shit|nigger|nazi)([._-]|$)/i;
export function validUsername(s: string) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(s) && !reserved.test(s);
}
export function safeHtml(html: string, images = false) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "div",
      "span",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "table",
      "tbody",
      "thead",
      "tr",
      "td",
      "th",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "a",
      ...(images ? ["img"] : []),
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: {
          ...attrs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" && !/^https:\/\//.test(frame.attribs.src || ""),
  });
}
export function verifyWebhook(
  body: string,
  timestamp: string,
  signature: string,
  now = Date.now(),
) {
  return (
    /^\d{10}$/.test(timestamp) &&
    Math.abs(now - Number(timestamp) * 1000) < 300000 &&
    equal(sign(`${timestamp}.${body}`, secret("INBOUND_SECRET")), signature)
  );
}
export function attachmentTicket(id: string, inboxId: string, expires: number) {
  return sign(`${id}.${inboxId}.${expires}`);
}
export const safePath = (s: string) =>
  /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(s) &&
  !s.startsWith("/api") &&
  !s.startsWith("/admin");
