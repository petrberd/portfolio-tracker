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
export function middleware(req: NextRequest) {
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
      if (timingSafeEqual(gotUser, user) && timingSafeEqual(gotPass, pass)) {
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
