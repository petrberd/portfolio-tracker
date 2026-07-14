import { NextRequest, NextResponse } from "next/server";

/**
 * Constant-time string comparison (Edge Runtime has no Node `crypto.timingSafeEqual`).
 * Always scans the full length of both inputs so a wrong guess doesn't return faster
 * for a longer common prefix.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length, 1);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * HTTP Basic Auth over the whole site. Active only when BASIC_AUTH_USER and
 * BASIC_AUTH_PASSWORD are set (locally in .env.local, on Netlify as env vars),
 * so the credentials never live in the repo. If unset, the app is open.
 *
 * Skipped entirely outside production (`npm run dev`) — the deployed site on
 * Netlify still enforces it (that build runs with NODE_ENV=production), but a
 * local dev server is already only reachable on the developer's own machine,
 * so gating it too just adds friction without a real security benefit.
 */
// Public even in production: the /demo page (synthetic portfolio, no real account
// data) and the two API routes it needs that carry no personal data of their own —
// /api/market (global VIX) and /api/analysts (ticker-keyed analyst consensus).
const PUBLIC_PATHS = ["/demo", "/api/demo/", "/api/market", "/api/analysts"];

// Exact match, or prefix match followed by "/" — so e.g. "/api/analysts" doesn't
// accidentally also cover a future "/api/analysts-internal" route (defense in
// depth; no such route exists today, but `startsWith` alone wouldn't catch it).
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

export function middleware(req: NextRequest) {
  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const gotUser = decoded.slice(0, sep);
      const gotPass = decoded.slice(sep + 1);
      // Evaluate both (not `&&`, which would short-circuit on a wrong username and
      // skip the password check) so a wrong guess never finishes faster for getting
      // the username right — that would leak a timing bit about it.
      const userOk = timingSafeEqual(gotUser, user);
      const passOk = timingSafeEqual(gotPass, pass);
      if (userOk && passOk) {
        return NextResponse.next();
      }
    } catch {
      /* fall through to 401 */
    }
  }
  return new NextResponse("Přístup vyžaduje přihlášení.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Portfolio Tracker", charset="UTF-8"' },
  });
}

// Protect everything except Next.js static assets and the favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
