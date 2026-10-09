import { journalImage } from "@/lib/og-image";
import { JOURNAL_NAME } from "@/lib/seo";

// The hub does not depend on the database, so this card is generated once at
// build time rather than on every social scrape.
export const alt = `${JOURNAL_NAME} — email privacy and safety guides`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return journalImage();
}
