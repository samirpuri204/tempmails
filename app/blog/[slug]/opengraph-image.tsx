import { getPost } from "@/lib/content-data";
import { editorialImage } from "@/lib/og-image";
export const alt = "TempMails journal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) return new Response("Not found", { status: 404 });
  return editorialImage(post.title, post.category);
}
