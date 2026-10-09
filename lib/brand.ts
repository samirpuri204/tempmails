import { siteOrigin } from "./site-url";

/**
 * Verified operator facts, in one place.
 *
 * These values are the business identity that every public page, footer,
 * structured-data block and legal document must agree on. They are confirmed
 * by the operator; nothing here is inferred from copy, a domain suffix, or a
 * guess. Before changing a value, confirm it — a stale or invented fact here
 * propagates into the About page, the Company page, the JSON-LD and the
 * policies at once, which is exactly the failure mode this file exists to
 * prevent.
 *
 * Deliberately NOT recorded here:
 *   - a registered company name or registration number (none supplied, so no
 *     incorporation claim is made anywhere on the site);
 *   - any postal or residential address (withheld by design);
 *   - third-party profile URLs (only real, operator-owned profiles belong in
 *     `sameAs`, and none were supplied).
 */
export const BRAND = {
  /** Product name as it appears in the wordmark and every policy. */
  name: "TempMails",
  /** Canonical public website. Derived from APP_URL, never hard-coded twice. */
  website: siteOrigin(),
  /** Human being accountable for the service. */
  founder: "Samir Giri",
  /** How the operator is described publicly. */
  operatorRole: "Founder & Operator",
  /** Country the service is operated from. */
  country: "India",
  /** ISO 3166-1 alpha-2 code for the same country, for structured data. */
  countryCode: "IN",
  /** Launch month, YYYY-MM. Month precision is deliberate. */
  foundingDate: "2026-08",
  /** Business contact mailbox. Confirmed monitored by the operator. */
  email: "founder@tempmails.live",
  /** Product category as presented to partners and program reviewers. */
  category: "Software & SaaS",
  /** Short, factual one-line description reused across pages. */
  tagline: "A private, no-signup temporary email inbox that expires on a timer.",
  /**
   * Public source repository. Published openly so that everything this site
   * claims can be checked against the code that does it, rather than taken on
   * trust. Referenced from the homepage, the About and Company pages, the AI
   * roadmap and the structured data, all from this one value.
   */
  repository: "https://github.com/samirpuri204/tempmails",
  /** SPDX identifier of the licence the source is published under. */
  license: "MIT",
} as const;

/** Canonical URL of the licence file, derived from the repository. */
export const LICENSE_URL = `${BRAND.repository}/blob/main/LICENSE`;
