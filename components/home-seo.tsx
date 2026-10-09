import Link from "next/link";
import { JOURNAL_NAME } from "@/lib/seo";

export default function HomeSeo({
  retentionMinutes,
}: {
  retentionMinutes: number;
}) {
  return (
    <section className="home-seo" aria-labelledby="temp-mail-guide">
      <span className="eyebrow">A guide to temporary email</span>
      <h2 id="temp-mail-guide">What is temp mail?</h2>
      <p>
        Temp mail is a temporary email address for receiving messages without
        sharing your everyday address. It is also called disposable email,
        throwaway email, or a burner inbox. TempMails gives you a private
        inbox without registration, with private browser access and an expiry
        countdown.
      </p>
      <p>
        Use it for a one-time download, a short-lived signup where disposable
        addresses are accepted, or an email workflow you are testing. Keep a
        permanent address for purchases, important accounts, and password
        recovery.
      </p>
      <div className="seo-guide-grid">
        <article>
          <h3>Receive a verification email</h3>
          <p>
            Copy the address above, use it on the sending website, and keep the
            inbox open. New messages appear automatically while the address is
            active.
          </p>
          <Link href="/temporary-email-for-verification">
            Guide to verification emails →
          </Link>
        </article>
        <article>
          <h3>Understand the expiry time</h3>
          <p>
            New inboxes currently start with {retentionMinutes} minutes. The
            countdown shows your actual remaining time. Request an extension
            before expiry if you need longer.
          </p>
          <Link href="/10-minute-mail">How temporary inbox timers work →</Link>
        </article>
        <article>
          <h3>Keep access private</h3>
          <p>
            Your browser stores an access cookie. Save the recovery token to
            reopen an active inbox on another device; the email address alone
            does not unlock it.
          </p>
          <Link href="/anonymous-email">Read the privacy limits →</Link>
        </article>
      </div>
      <h2>Temp mail questions</h2>
      <details>
        <summary>Is TempMails free, and do I need to sign up?</summary>
        <p>
          You can create a free temporary inbox without registering. A security
          check and usage limits help prevent abuse.
        </p>
      </details>
      <details>
        <summary>Can I send email or receive verification codes?</summary>
        <p>
          Receiving always works. Sending short plain-text messages from your
          address is available only when the site shows a Send email button;
          it is rate-limited and every message is marked as sent from a
          temporary address. Verification codes can arrive when the sender
          accepts the address and delivers before it expires. Acceptance and
          delivery are not guaranteed.
        </p>
      </details>
      <details>
        <summary>Why is my temporary email not receiving messages?</summary>
        <p>
          Check the address spelling, remaining time, and whether the sender
          accepts disposable email. Refresh the inbox and avoid repeated resend
          requests.{" "}
          <Link href="/temp-mail-not-receiving-emails">
            Follow the delivery troubleshooting guide
          </Link>
          .
        </p>
      </details>
      <details>
        <summary>Is a burner email the same as an email alias?</summary>
        <p>
          A burner inbox is usually short-lived. An alias normally forwards
          messages to an existing mailbox and may stay active for much longer.{" "}
          <Link href="/temporary-email-vs-email-alias">
            Compare temporary email and aliases
          </Link>
          .
        </p>
      </details>
      <nav aria-label="Temporary email guides" className="seo-guide-links">
        <Link href="/temporary-email">Temporary email explained</Link>
        <Link href="/how-long-does-temp-mail-last">How long a temp mail lasts</Link>
        <Link href="/how-to-choose-a-temp-mail-service">How to choose a temp mail service</Link>
        <Link href="/disposable-email">When to use disposable email</Link>
        <Link href="/temporary-email-for-testing">Test an email workflow</Link>
        <Link href="/how-it-works">How TempMails works</Link>
        <Link href="/faq">All questions and answers</Link>
      </nav>
      {/* The homepage is the strongest page on the site, so the editorial hub
          and the service pages are linked from here too, instead of the
          journal being reachable only from the guides and vice versa. */}
      <nav aria-label="About TempMails" className="seo-guide-links">
        <Link href="/blog">{JOURNAL_NAME}</Link>
        <Link href="/about">About TempMails</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/acceptable-use">Acceptable use</Link>
      </nav>
    </section>
  );
}
