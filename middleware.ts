import { NextRequest, NextResponse } from "next/server";

/**
 * HTTP Basic Auth over the whole site. Active only when BASIC_AUTH_USER and
 * BASIC_AUTH_PASSWORD are set (locally in .env.local, on Netlify as env vars),
 * so the credentials never live in the repo. If unset, the app is open.
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      if (decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass) {
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
