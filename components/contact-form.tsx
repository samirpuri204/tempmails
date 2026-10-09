"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";

/**
 * Public contact form.
 *
 * The browser supplies convenience validation only; every value is validated
 * again server-side against `contactSchema`, and the endpoint applies its own
 * per-IP limit, honeypot check and Turnstile action. Nothing here is trusted.
 *
 * States are explicit because "did that send?" is the whole question a contact
 * form has to answer: idle → sending → sent, with a distinct failure state that
 * tells the visitor to email the address directly when the deployment has no
 * working mail provider configured.
 */
const CATEGORIES = [
  {
    id: "business",
    label: "Business & partnership enquiries",
    hint: "Partnerships, integrations, commercial questions, press.",
  },
  {
    id: "support",
    label: "Technical support",
    hint: "A page that misbehaved, an inbox that missed a message, a countdown question.",
  },
  {
    id: "security",
    label: "Security & abuse reports",
    hint: "Abuse sent from this domain, or something that looks like a vulnerability.",
  },
  {
    id: "privacy",
    label: "Privacy requests",
    hint: "Access, correction or deletion questions about data held about you.",
  },
] as const;

const MESSAGES: Record<string, string> = {
  TOO_MANY_REQUESTS:
    "Too many messages have been sent from this connection recently. Please try again later.",
  CAPTCHA_REQUIRED: "Complete the security check before sending.",
  CAPTCHA_FAILED:
    "The security check did not pass. Refresh the page and try once more.",
  BOT_PROTECTION_UNAVAILABLE:
    "The security check is unavailable right now. Please email the address below instead.",
  MAINTENANCE: "The site is briefly unavailable. Please try again shortly.",
  INVALID_INPUT: "One of the fields needs adjusting — check the address and the message length.",
  CONTACT_DELIVERY_FAILED:
    "The message could not be delivered. Please email the address below instead.",
  CONTACT_UNAVAILABLE:
    "This deployment has no outbound mail provider configured, so the form cannot deliver. Please email the address below.",
  SERVICE_UNAVAILABLE:
    "The service could not be reached. Please try again, or email the address below.",
};

type Status = "idle" | "sending" | "sent";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [ready, setReady] = useState(false);
  const captchaEl = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const needsCaptcha = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  // One widget, rendered explicitly so its `action` matches the server check.
  // `bot(req, token, "contact")` rejects a token minted for any other action,
  // which is what stops a token harvested from the inbox flow being replayed
  // here.
  useEffect(() => {
    const turnstile = window.turnstile;
    if (!needsCaptcha || !ready || !captchaEl.current || !turnstile) return;
    widget.current = turnstile.render(captchaEl.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      action: "contact",
      callback: (token: string) => setCaptcha(token),
      "expired-callback": () => setCaptcha(""),
      "error-callback": () => setCaptcha(""),
    });
    return () => {
      if (widget.current) turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [needsCaptcha, ready]);

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (status === "sending") return;
      setError("");
      if (needsCaptcha && !captcha) {
        setError(MESSAGES.CAPTCHA_REQUIRED);
        return;
      }
      const form = event.currentTarget;
      // Fields are collected by name rather than spread from the whole
      // FormData: Turnstile injects its own hidden `cf-turnstile-response`
      // input into the form, and forwarding every field the DOM happens to
      // contain is what made the first live submission fail validation. The
      // server contract is this list, so the client sends exactly this list.
      const fd = new FormData(form);
      const field = (name: string) => String(fd.get(name) ?? "");
      const data = {
        category: field("category"),
        name: field("name"),
        email: field("email"),
        subject: field("subject"),
        message: field("message"),
        company: field("company"),
      };
      setStatus("sending");
      try {
        const r = await fetch("/api/contact", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, ...(captcha ? { captcha } : {}) }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const code = body?.error?.code || "SERVICE_UNAVAILABLE";
          setError(MESSAGES[code] || MESSAGES.SERVICE_UNAVAILABLE);
          setStatus("idle");
          return;
        }
        form.reset();
        setStatus("sent");
        setCaptcha("");
      } catch {
        setError(MESSAGES.SERVICE_UNAVAILABLE);
        setStatus("idle");
      } finally {
        // Turnstile tokens are single-use, including after a rejection.
        if (widget.current) window.turnstile?.reset(widget.current);
      }
    },
    [captcha, needsCaptcha, status],
  );

  if (status === "sent") {
    return (
      <div className="contact-state" role="status">
        <h3>Message sent</h3>
        <p>
          Thank you — it has been delivered to {BRAND.email}. Security and abuse
          reports are read first; ordinary questions usually get a reply within
          a few days. No response time is guaranteed.
        </p>
        <button type="button" className="primary" onClick={() => setStatus("idle")}>
          Send another message
        </button>
      </div>
    );
  }

  return (
    <>
      <form className="contact-form" onSubmit={submit} noValidate={false}>
        <fieldset className="contact-categories">
          <legend>What is this about?</legend>
          {CATEGORIES.map((c, i) => (
            <label key={c.id}>
              <input
                type="radio"
                name="category"
                value={c.id}
                defaultChecked={i === 0}
                required
              />
              <span>
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="contact-fields">
          <label htmlFor="contact-name">
            Your name <span className="optional">(optional)</span>
            <input
              id="contact-name"
              name="name"
              type="text"
              maxLength={80}
              autoComplete="name"
            />
          </label>
          <label htmlFor="contact-email">
            Your email address
            <input
              id="contact-email"
              name="email"
              type="email"
              maxLength={254}
              autoComplete="email"
              required
              aria-describedby="contact-email-hint"
            />
            <small id="contact-email-hint">
              Used only so a reply can reach you. It is set as the reply address
              on the notification and is not stored by this site.
            </small>
          </label>
          <label htmlFor="contact-subject">
            Subject <span className="optional">(optional)</span>
            <input
              id="contact-subject"
              name="subject"
              type="text"
              maxLength={150}
            />
          </label>
          <label htmlFor="contact-message">
            Message
            <textarea
              id="contact-message"
              name="message"
              rows={7}
              minLength={20}
              maxLength={4000}
              required
              aria-describedby="contact-message-hint"
            />
            <small id="contact-message-hint">
              At least 20 characters. Do not include passwords, one-time codes,
              recovery tokens, or card details — nothing here needs them.
            </small>
          </label>
        </div>
        {/* Honeypot. Hidden from sighted users and from assistive technology;
            any value in it means a form filler, and the server answers such a
            submission exactly as if it had been delivered. */}
        <div className="contact-hp" aria-hidden="true">
          <label htmlFor="contact-company">Company</label>
          <input
            id="contact-company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        {needsCaptcha && (
          <div className="captcha">
            <div ref={captchaEl} />
          </div>
        )}
        {error && (
          <p className="contact-error" role="alert">
            {error}
          </p>
        )}
        <div className="contact-actions">
          <button
            type="submit"
            className="primary"
            disabled={status === "sending" || (needsCaptcha && !captcha)}
          >
            {status === "sending" ? "Sending…" : "Send message"}
          </button>
          <a className="contact-direct" href={`mailto:${BRAND.email}`}>
            Or email {BRAND.email}
          </a>
        </div>
      </form>
      {needsCaptcha && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
        />
      )}
    </>
  );
}
