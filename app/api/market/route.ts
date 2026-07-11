import { NextRequest, NextResponse } from "next/server";
import { fetchQuote } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Market mood: CBOE Volatility Index (^VIX) — the "fear index". */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const q = await fetchQuote("^VIX", force);
  if (!q.price) return NextResponse.json({ available: false });
  return NextResponse.json({ available: true, vix: q.price, changePercent: q.changePercent });
}
