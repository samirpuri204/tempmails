export const dynamic = "force-static";

// Authorized sellers file for Google AdSense. Without it, some buyers treat
// inventory as unauthorized and bid less or not at all. Keep the pub ID in
// sync with layout.tsx and components/adsense-slot.tsx.
export function GET(): Response {
  return new Response("google.com, pub-3624892885273135, DIRECT, f08c47fec0942fa0\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
