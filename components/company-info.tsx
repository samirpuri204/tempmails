import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { siteOrigin } from "@/lib/site-url";

/**
 * Verification-friendly company summary.
 *
 * Rendered from `lib/brand.ts` rather than retyped per page, so /about,
 * /company and any future page cannot drift apart on the operator's name, the
 * country or the founding date. Every value here is confirmed by the operator;
 * nothing is inferred.
 *
 * `compact` is used on /about, where this block sits alongside the founder
 * section; `full` is used on /company, where this summary is the page.
 */
export default function CompanyInfo({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const origin = siteOrigin();
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Product name", value: BRAND.name },
    {
      label: "Official website",
      value: (
        <a href={origin} rel="noopener">
          {origin.replace(/^https?:\/\//, "")}
        </a>
      ),
    },
    {
      label: "Operator",
      value: (
        <>
          {BRAND.founder} — {BRAND.operatorRole}
        </>
      ),
    },
    { label: "Operating location", value: BRAND.country },
    {
      label: "Founded",
      value: (
        <time dateTime={BRAND.foundingDate}>
          {formatFoundingDate(BRAND.foundingDate)}
        </time>
      ),
    },
    { label: "Product category", value: BRAND.category },
    {
      label: "Business contact",
      value: (
        <a href={`mailto:${BRAND.email}`}>
          {BRAND.email}
        </a>
      ),
    },
    {
      label: "Development status",
      value: "Actively maintained; running in production",
    },
    {
      label: "Public profiles",
      value: "No third-party profiles are published",
    },
  ];

  return (
    <section
      className={`company-info company-info--${variant}`}
      aria-labelledby="company-information"
    >
      <h2 id="company-information">Company information</h2>
      <p>
        A single, verifiable summary of who operates {BRAND.name}. The same
        facts appear on the About page, in the structured data search engines
        read, and in the policies below — if any two of them ever disagree, that
        is a defect worth reporting through the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
      <dl className="company-facts">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="company-note">
        Withheld deliberately: a postal address, identity documents, and any
        company-registration identifier. None of them are needed to contact the
        operator or to assess the service, and publishing them would trade the
        operator&rsquo;s privacy for no verification value. We also state no
        registration, funding or endorsement claim that the operator cannot
        evidence.
      </p>
      {variant === "compact" && (
        <p className="company-note">
          <Link href="/company">See the full company and operator summary</Link>
          .
        </p>
      )}
    </section>
  );
}

/** "2026-08" → "August 2026". Kept local so no locale data leaks into the page. */
export function formatFoundingDate(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = names[Number(month) - 1];
  return name ? `${name} ${year}` : value;
}
