// Structured data for the operator, built only from confirmed facts.
//
// Kept separate from the homepage route so the same entity is emitted on every
// page that describes the business — the homepage, /about and /company — with
// one `@id`. Two pages inventing their own Organization node is how a site ends
// up claiming two companies to a crawler, or a stale founding date on one page
// and a fresh one on another.
//
// Fields that could not be verified are omitted rather than estimated:
// no `sameAs` (no operator-owned profiles were supplied), no `address` beyond
// the country, and no legal-entity identifiers.
import { BRAND, LICENSE_URL } from "./brand";
import { siteOrigin } from "./site-url";

export type OrganizationInput = {
  /** Site name from settings, so a rename cannot desync the entity. */
  name: string;
  /** Absolute logo URL, omitted when the operator has not uploaded one. */
  logoUrl?: string;
  /** Optional operator-authored description; falls back to the brand tagline. */
  description?: string;
  /** Links to real, operator-owned profiles only. */
  sameAs?: string[];
};

/** The founder/operator as a Person entity. */
export function founderSchema() {
  return {
    "@type": "Person",
    "@id": `${siteOrigin()}/#founder`,
    name: BRAND.founder,
    jobTitle: BRAND.operatorRole,
    worksFor: { "@id": `${siteOrigin()}/#organization` },
  };
}

/** The operating organisation, with its confirmed identity. */
export function organizationSchema({
  name,
  logoUrl,
  description,
  sameAs = [],
}: OrganizationInput) {
  const origin = siteOrigin();
  // The public source repository always counts as `sameAs`: it is the one
  // operator-owned URL that corroborates the entity without asserting anything
  // that cannot be checked. Any operator-supplied profiles are merged in.
  const profiles = [...new Set([BRAND.repository, ...sameAs])];
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name,
    url: origin,
    description: description || BRAND.tagline,
    foundingDate: BRAND.foundingDate,
    founder: { "@id": `${origin}/#founder` },
    email: BRAND.email,
    address: {
      "@type": "PostalAddress",
      addressCountry: BRAND.countryCode,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: BRAND.email,
      url: `${origin}/contact`,
      availableLanguage: ["en"],
    },
    ...(logoUrl ? { logo: logoUrl } : {}),
    sameAs: profiles,
  };
}

/**
 * The published source, as a first-class entity. Gives a crawler the repository
 * and the licence directly rather than leaving them to be discovered from the
 * page text.
 */
export function sourceCodeSchema(name: string) {
  const origin = siteOrigin();
  return {
    "@type": "SoftwareSourceCode",
    "@id": `${origin}/#source`,
    name: `${name} source code`,
    codeRepository: BRAND.repository,
    license: LICENSE_URL,
    programmingLanguage: ["TypeScript", "JavaScript"],
    runtimePlatform: "Node.js",
    author: { "@id": `${origin}/#organization` },
  };
}

/** The nodes emitted as one `@graph` on company-identity pages. */
export function companyGraph(input: OrganizationInput) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(input),
      founderSchema(),
      sourceCodeSchema(input.name),
    ],
  };
}
