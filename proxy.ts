import { NextRequest, NextResponse } from "next/server";

/**
 * The Content-Security-Policy for a response, given the path it is serving.
 *
 * Exported so the policy can be unit-tested directly: the one property that
 * matters — `'unsafe-eval'` reaching only the pages that can carry an ad tag —
 * is otherwise only observable by running the deployed site.
 */
export function contentSecurityPolicy(
  pathname: string,
  nonce: string,
  dev = process.env.NODE_ENV === "development",
) {
  // Ad tags evaluate strings at runtime, so a page that can carry one needs
  // 'unsafe-eval'. It is granted to the public pages only: /admin and /api
  // mount no ad component and keep the strict policy, so nothing that renders
  // operator or mail data can reach eval() or the ad network's font hosts. The
  // rest of the policy is unchanged — 'nonce' + 'strict-dynamic' still decide
  // which scripts may run, and no ad host is allowlisted for scripts.
  // See docs/MONETIZATION.md §7.
  const adBearing =
    !pathname.startsWith("/admin") && !pathname.startsWith("/api");
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(dev || adBearing ? ["'unsafe-eval'"] : []),
    "https://challenges.cloudflare.com",
  ].join(" ");
  // An ad overlay injects its own Google Fonts stylesheet, so the ad-bearing
  // pages allow that stylesheet and the font files it pulls. Scoped exactly like
  // 'unsafe-eval': /admin and /api keep the tightest policy, and the grant adds
  // no script source anywhere — CSS cannot execute. Measured on production: with
  // this blocked the format still rendered, but under the browser's fallback
  // fonts, and every page logged a CSP violation.
  const styleSrc = ["'self'", "'unsafe-inline'", ...(adBearing ? ["https://fonts.googleapis.com"] : [])].join(" ");
  const fontSrc = ["'self'", ...(adBearing ? ["https://fonts.gstatic.com"] : [])].join(" ");
  return `default-src 'self'; script-src ${scriptSrc}; style-src ${styleSrc}; img-src 'self' data: https:; font-src ${fontSrc}; connect-src 'self' https:; frame-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
}

export function proxy(req: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    req.nextUrl.hostname === "tempmails-zeta.vercel.app"
  ) {
    const destination = new URL(process.env.APP_URL!);
    destination.pathname = req.nextUrl.pathname;
    destination.search = req.nextUrl.search;
    return NextResponse.redirect(destination, 307);
  }
  // Crawler documents are public and must not inherit inbox cookies' noindex
  // or private caching headers. They do not execute scripts or need a nonce.
  if (["/robots.txt", "/sitemap.xml", "/sitemap-index.xml"].includes(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // script-src stays nonce + 'strict-dynamic': only scripts our own trusted
  // bundle inserts (Turnstile, AdSense, the Monetag tag) can execute. Under
  // 'strict-dynamic' a script our nonced bundle creates needs no host allowlist
  // and no nonce of its own, which is why no ad host appears below — see
  // docs/MONETIZATION.md for the reasoning and the exact hosts involved.
  // connect-src / frame-src are open to https: because ad networks call and
  // frame a rotating set of CDN hosts that cannot be enumerated; img-src was
  // already https:. Everything else remains locked down.
  const csp = contentSecurityPolicy(req.nextUrl.pathname, nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  if (
    req.nextUrl.pathname.startsWith("/admin") ||
    req.cookies.has("tm_inbox")
  ) {
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
