// Public contact form delivery.
//
// Deliberately not routed through `lib/outbound.ts`: that pipeline sends *from*
// a visitor's temporary address and is gated on an active inbox (`inboxAuth`),
// which is the opposite direction. This module sends *to* the operator and is
// reachable without an inbox at all.
//
// Privacy properties, because the submission is visitor-authored content:
//   - nothing is written to the database — no new table, no PII at rest beyond
//     the operator's own mailbox;
//   - the submission is never echoed back into a response or logged;
//   - the only address taken from the visitor is the one they must supply for a
//     reply, and it is used solely as the mail's Reply-To;
//   - provider selection matches the rest of the product (Resend, then SMTP),
//     so the service does not gain a second mail vendor by adding a form.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./http";
import { settings } from "./settings";
import { cleanSubject, cleanText, provider } from "./outbound";
import { BRAND } from "./brand";
import { siteOrigin } from "./site-url";

/**
 * Contact categories. The four values map to the four sections rendered on
 * /contact so the form, the page and the routing of the resulting mail stay
 * aligned; an unknown value is rejected rather than silently defaulted.
 */
export const CONTACT_CATEGORIES = [
  "business",
  "support",
  "security",
  "privacy",
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/**
 * `company` is a honeypot: a real visitor never sees the field, so any value in
 * it means a form filler. It is accepted here (rather than rejected) so the
 * handler can return a normal success response and waste the bot's time instead
 * of teaching it which field tripped the check.
 */
export const contactSchema = z
  .object({
    category: z.enum(CONTACT_CATEGORIES),
    name: z.string().trim().max(80).default(""),
    email: z.email().max(254),
    subject: z.string().trim().max(150).default(""),
    message: z.string().trim().min(20).max(4000),
    company: z.string().trim().max(200).default(""),
    captcha: z.string().max(4096).optional(),
    // Turnstile renders its own hidden input *inside* the form element, so a
    // real browser submission carries this field in addition to `captcha`.
    // Found in production: the first genuine submission was rejected with
    // INVALID_INPUT because `.strict()` treated the widget's field as unknown.
    // It is accepted explicitly rather than by weakening the schema, so
    // strictness still catches drift in our own client.
    "cf-turnstile-response": z.string().max(4096).optional(),
  })
  .strict();
export type ContactInput = z.infer<typeof contactSchema>;

const LABELS: Record<ContactCategory, string> = {
  business: "Business & partnerships",
  support: "Technical support",
  security: "Security & abuse",
  privacy: "Privacy request",
};

/**
 * Where a submission is delivered.
 *
 * `settings.contactEmail` is the operator-controlled value shown on /contact;
 * the brand constant is the confirmed fallback so a fresh install still reaches
 * a real mailbox instead of dropping the message.
 */
export async function contactRecipient() {
  try {
    const s = await settings();
    if (s.contactEmail) return s.contactEmail;
  } catch {
    // A settings read failure must not silently discard a visitor's message.
  }
  return BRAND.email;
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/**
 * Sender address for the notification.
 *
 * The domain must be one the mail provider has verified, so it is derived from
 * configuration rather than invented: an explicit CONTACT_FROM wins, then the
 * alert sender already used by the maintenance job, then the configured
 * receiving domain.
 */
export function contactSender() {
  const explicit = process.env.CONTACT_FROM?.trim();
  if (explicit) return explicit;
  const alert = process.env.ALERT_FROM?.trim();
  if (alert) return alert;
  const domain = process.env.EMAIL_DOMAIN?.trim();
  return domain ? `contact@${domain}` : "";
}

export function renderContact(input: ContactInput) {
  const label = LABELS[input.category];
  const subject = `[${BRAND.name} · ${label}] ${
    cleanSubject(input.subject) || "(no subject)"
  }`;
  const body = [
    `Category: ${label}`,
    `Name: ${cleanText(input.name) || "(not given)"}`,
    `Reply-to: ${input.email}`,
    `Page: ${siteOrigin()}/contact`,
    `Received: ${new Date().toISOString()}`,
    "",
    cleanText(input.message),
    "",
    "--",
    `Sent through the ${BRAND.name} contact form. Replying to this message writes`,
    `back to ${input.email}. Nothing from this submission was stored by the site.`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#172524;margin:0;padding:16px">` +
    `<p style="margin:0 0 12px;font-size:13px;color:#4a5654">${escape(label)} &middot; reply directly to this message to answer <strong>${escape(input.email)}</strong></p>` +
    `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(cleanText(input.message))}</div>` +
    `<hr style="border:0;border-top:1px solid #e3e8e7;margin:20px 0 8px">` +
    `<p style="margin:0;font-size:11px;color:#8a9492">Name: ${escape(cleanText(input.name) || "(not given)")} &middot; Page: ${escape(siteOrigin())}/contact &middot; ${escape(new Date().toISOString())}</p>` +
    `</body></html>`;
  return { subject, body, html };
}

/**
 * Deliver one submission. Throws `ApiError(503, CONTACT_UNAVAILABLE)` when the
 * deployment has no working mail provider, so the caller can tell the visitor
 * to use the mailbox directly instead of losing the message silently.
 */
export async function deliverContact(input: ContactInput) {
  const p = provider();
  const from = contactSender();
  const to = await contactRecipient();
  if (!p || !from || !to) throw new ApiError(503, "CONTACT_UNAVAILABLE");
  const { subject, body, html } = renderContact(input);
  // A reference unique to this attempt, matching how the outbound pipeline
  // names a message: it gives the provider a key that de-duplicates its own
  // retries, and gives the operator a handle when a delivery is queried.
  //
  // Deliberately *not* derived from the submission: a content-derived key would
  // make the provider silently drop a second, genuinely intended message that
  // happened to have identical text — losing a real enquiry to suppress a
  // duplicate is the wrong trade.
  const ref = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  if (p === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `contact/${ref}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: input.email,
        subject,
        text: body,
        html,
        headers: { "X-Entity-Ref-ID": ref },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new ApiError(502, "CONTACT_DELIVERY_FAILED");
    return { delivered: true as const };
  }
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(process.env.SMTP_URL!, {
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  await transport.sendMail({
    from,
    to,
    replyTo: input.email,
    subject,
    text: body,
    html,
    messageId: `<contact-${ref}@${from.split("@")[1]}>`,
  });
  return { delivered: true as const };
}
