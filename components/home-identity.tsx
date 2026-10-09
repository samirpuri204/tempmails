import Link from "next/link";
import {
  Github,
  ArrowRight,
  Building2,
  MapPin,
  CalendarDays,
  Scale,
  Mail,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatFoundingDate } from "@/components/company-info";

/**
 * Who operates this service, presented as a card.
 *
 * The previous version was three loose paragraphs of text, which read as an
 * afterthought on the page a visitor lands on. This states the same facts with
 * a hierarchy, and — because a claim nobody can follow is worth little — turns
 * each one into a link to the place it can be checked.
 *
 * Everything is a real anchor in the server-rendered HTML, so the company
 * pages, the roadmap and the public repository are reachable by a crawler that
 * never runs JavaScript, not only by a human who spots a link. All the values
 * come from `lib/brand.ts`, so a stale name, country or URL cannot be
 * advertised here while another page contradicts it.
 */
export default function HomeIdentity({
  contactEmail,
}: {
  /** Operator-controlled setting; falls back to the confirmed business mailbox. */
  contactEmail?: string;
}) {
  const email = contactEmail || BRAND.email;
  const facts = [
    { icon: Building2, label: "Operator", value: `${BRAND.founder} — ${BRAND.operatorRole}` },
    { icon: MapPin, label: "Operating location", value: BRAND.country },
    {
      icon: CalendarDays,
      label: "Launched",
      value: (
        <time dateTime={BRAND.foundingDate}>{formatFoundingDate(BRAND.foundingDate)}</time>
      ),
    },
    { icon: Scale, label: "Licence", value: `${BRAND.license} — open source, free to fork` },
  ] as const;

  return (
    <section className="content-page identity" aria-labelledby="operated-in-the-open">
      <div className="identity-card">
        <p className="identity-monogram" aria-hidden="true">
          {BRAND.founder
            .split(" ")
            .map((part) => part[0])
            .join("")}
          <span className="identity-monogram-dot" />
        </p>

        <div className="identity-main">
          <p className="identity-eyebrow">Independent, and built in the open</p>
          <h2 id="operated-in-the-open">Operated in the open</h2>
          <p className="identity-lead">
            {BRAND.name} is built and run by{" "}
            <strong>{BRAND.founder}</strong> in <strong>{BRAND.country}</strong> —
            one operator, no support department, and no investor to answer to.
            The code behind every claim on this site is public, so nothing here
            has to be taken on trust.
          </p>

          <dl className="identity-facts">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <dt>
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <nav className="identity-actions" aria-label="Company and project information">
            <a
              className="identity-action identity-action--primary"
              href={BRAND.repository}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Github size={17} aria-hidden="true" />
              Open source on GitHub
              <ArrowRight size={15} aria-hidden="true" />
            </a>
            <Link className="identity-action" href="/company">
              <Building2 size={16} aria-hidden="true" />
              Company information
            </Link>
            <Link className="identity-action" href="/ai-roadmap">
              <Sparkles size={16} aria-hidden="true" />
              AI roadmap
            </Link>
            <Link className="identity-action" href="/blog">
              <BookOpen size={16} aria-hidden="true" />
              Guides
            </Link>
            <a className="identity-action" href={`mailto:${email}`}>
              <Mail size={16} aria-hidden="true" />
              {email}
            </a>
          </nav>

          <p className="identity-footnote">
            Find these again at any time: the{" "}
            <Link href="/about">About page</Link>, the{" "}
            <Link href="/company">company summary</Link>, the{" "}
            <Link href="/ai-roadmap">AI roadmap</Link>, and the{" "}
            <a href={BRAND.repository} rel="noopener noreferrer" target="_blank">
              source repository
            </a>
            . Anything held back is held back openly — see{" "}
            <Link href="/company">what is deliberately not published</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
