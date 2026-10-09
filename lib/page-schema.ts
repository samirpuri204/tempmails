// JSON-LD for a public content page.
//
// Extracted from the route so the guarantee is testable: the markup must
// describe exactly what the page renders, and it must be one entity per URL.
import { webPageSlugs } from "./content-registry";
import { siteOrigin, siteUrl } from "./site-url";

export type Faq = { question: string; answer: string };

// Pages that describe the business itself are typed as such; every other
// non-editorial page is a plain WebPage, and content pages are Articles.
const COMPANY_PAGES = new Set(["about", "company"]);
const primaryType = (slug: string) =>
  COMPANY_PAGES.has(slug)
    ? "AboutPage"
    : slug === "contact"
      ? "ContactPage"
      : webPageSlugs.has(slug)
        ? "WebPage"
        : "Article";

/**
 * Builds the page entity.
 *
 * `/[slug]` renders its own visible "Common questions" block, so when FAQs
 * exist the *same* entity is additionally typed FAQPage and carries them as
 * `mainEntity`. A detached second node with its own `@id` would be free to
 * drift away from the page it claims to describe.
 *
 * This is not a rich-result play: Google retired normal FAQ rich results in
 * 2026. The Q&A is on the page because readers ask those questions.
 */
export function pageSchema({
  slug,
  title,
  description,
  updatedAt,
  faqs,
  siteName,
}: {
  slug: string;
  title: string;
  description: string;
  updatedAt: Date;
  faqs: Faq[];
  siteName: string;
}) {
  const type = primaryType(slug);
  const isArticle = type === "Article";
  const url = siteUrl(`/${slug}`);
  return {
    "@context": "https://schema.org",
    "@type": faqs.length > 0 ? [type, "FAQPage"] : type,
    "@id": `${url}#page`,
    name: title,
    ...(isArticle
      ? {
          headline: title,
          author: { "@type": "Organization", name: siteName, url: siteUrl("/about") },
          image: siteUrl(`/${slug}/opengraph-image`),
        }
      : {}),
    description,
    dateModified: updatedAt.toISOString(),
    url,
    mainEntityOfPage: url,
    isPartOf: { "@id": `${siteOrigin()}/#website` },
    inLanguage: "en",
    publisher: { "@type": "Organization", name: siteName, url: siteOrigin() },
    ...(faqs.length > 0
      ? {
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : {}),
  };
}
