import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same as /api/wishlist/search, just under /api/demo/ so middleware.ts's PUBLIC_PATHS
 * (unauthenticated) covers it — this is stateless autocomplete, no demo-specific storage. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const results = await searchSymbols(q);
  return NextResponse.json({ results });
}
