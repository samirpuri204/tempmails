import { Github, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Prominent, highlighted link to the public source repository.
 *
 * Deliberately a component rather than a link written into each page: the
 * repository URL, the licence name and the wording all come from
 * `lib/brand.ts`, so a page cannot advertise a stale address or a licence the
 * project does not actually grant.
 *
 * `variant="panel"` is the standing callout used on the Company and AI-roadmap
 * pages; `variant="inline"` is the compact form used in asides and footers.
 */
export default function RepositoryCallout({
  variant = "panel",
  note,
}: {
  variant?: "panel" | "inline";
  /** Page-specific reason to read the code; falls back to a general one. */
  note?: string;
}) {
  const body =
    note ||
    `Every claim on this site can be checked against the code that makes it: the receiving pipeline, the expiry and deletion behaviour described in the privacy policy, and the AI plans on this page. It is published under the ${BRAND.license} licence, so any developer can read, run, fork or build on it.`;

  if (variant === "inline") {
    return (
      <a
        className="repo-inline"
        href={BRAND.repository}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Github size={16} aria-hidden="true" />
        <span>Open source on GitHub</span>
        <ArrowRight size={14} aria-hidden="true" />
      </a>
    );
  }

  return (
    <section className="repo-panel" aria-labelledby="open-source">
      <div className="repo-panel-head">
        <Github size={22} aria-hidden="true" />
        <h2 id="open-source">Open source on GitHub</h2>
      </div>
      <p>{body}</p>
      <p className="repo-panel-links">
        <a
          className="repo-cta"
          href={BRAND.repository}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Github size={16} aria-hidden="true" />
          Browse the repository
        </a>
        <a
          href={`${BRAND.repository}/blob/main/LICENSE`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {BRAND.license} licence
        </a>
        <a
          href={`${BRAND.repository}/blob/main/README.md`}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read the documentation
        </a>
      </p>
      <p className="repo-panel-url">
        <code>
          {BRAND.repository.replace(/^https?:\/\//, "")}
        </code>
      </p>
    </section>
  );
}
