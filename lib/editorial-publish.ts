// Publication gate for journal content.
//
// docs/EDITORIAL.md is the source of truth: a human publishes, machines only
// prepare. This helper is the single place that decides whether a journal row
// is live, so the sync script, the admin API and the tests cannot drift apart.
//
// It deliberately never calls `new Date()`: no automated step may invent a
// publication or review timestamp. A row is live only when a human recorded a
// publication date in the manifest, or the row is already published in the
// database. Existing dates are preserved, never overwritten.

export type PublicationInput = {
  publishedAt: Date | null;
  reviewedAt: Date | null;
};

export type StoredPublication = {
  published: boolean;
  publishedAt: Date | null;
  reviewedAt: Date | null;
} | null;

export function resolvePublication(
  manifest: PublicationInput,
  stored: StoredPublication,
): { published: boolean; publishedAt: Date | null; reviewedAt: Date | null } {
  const alreadyLive = stored?.published === true;
  return {
    // A null manifest date keeps the row a draft; an already-live row stays
    // live so a content sync can never un-publish a human's publication.
    published: alreadyLive || manifest.publishedAt !== null,
    publishedAt: stored?.publishedAt ?? manifest.publishedAt,
    reviewedAt: stored?.reviewedAt ?? manifest.reviewedAt,
  };
}
