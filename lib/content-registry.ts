import { articles } from "./content";

export const contentLinks = [
  { path: "/blog", label: "Journal" },
  { path: "/temporary-email", label: "Temporary email" },
  { path: "/how-it-works", label: "How it works" },
  { path: "/temp-mail-not-receiving-emails", label: "Delivery help" },
  { path: "/temporary-email-vs-email-alias", label: "Email aliases" },
  { path: "/temporary-email-for-testing", label: "Email testing" },
  { path: "/about", label: "About" },
  { path: "/company", label: "Company" },
  { path: "/contact", label: "Contact" },
  { path: "/ai-roadmap", label: "AI roadmap" },
  { path: "/privacy", label: "Privacy" },
  { path: "/terms", label: "Terms" },
  { path: "/acceptable-use", label: "Acceptable use" },
];
export const publicContentPaths = () => ["/", "/blog", ...Object.keys(articles).map(slug => `/${slug}`)];
/**
 * Slugs that are part of the product's own site rather than editorial output.
 *
 * Membership decides two things in `/[slug]`: the JSON-LD primary type
 * (AboutPage / ContactPage / WebPage instead of Article) and whether the page
 * carries an author byline. A company or roadmap page is published by the
 * operator, not bylined like a guide, so it belongs here.
 */
export const webPageSlugs = new Set([
  "about",
  "company",
  "contact",
  "ai-roadmap",
  "privacy",
  "terms",
  "acceptable-use",
  "faq",
]);
