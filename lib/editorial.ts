export type Source = { title: string; url: string };

/**
 * Revision date for the static guides in `lib/content.ts`. Those pages are
 * code-reviewed copy with no CMS row, so there is no stored timestamp to read.
 * Bump this constant whenever guide copy changes; it is the date shown as
 * "Last updated" and emitted as `dateModified`. CMS-backed pages keep using
 * their own `updatedAt` and are unaffected.
 */
export const STATIC_CONTENT_UPDATED_AT = new Date("2026-09-17T04:15:40.000Z");
export const displayDate = (date: Date) => new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(date);
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
export function sourcesFrom(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Source => {
    if (!item || typeof item !== "object" || typeof item.title !== "string" || typeof item.url !== "string") return false;
    try { const url = new URL(item.url); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  });
}
