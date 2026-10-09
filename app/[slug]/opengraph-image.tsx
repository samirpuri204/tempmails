import { getPage } from "@/lib/content-data";
import { editorialImage } from "@/lib/og-image";
export const alt = "TempMails guide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPage((await params).slug);
  if (!p) return new Response("Not found", { status: 404 });
  return editorialImage(p.title, "Guides");
}
