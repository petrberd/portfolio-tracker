import { NextRequest, NextResponse } from "next/server";
import { fetchQuote, fetchDailyCloses } from "@/lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Market mood: CBOE Volatility Index (^VIX) — the "fear index". */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const [q, history] = await Promise.all([fetchQuote("^VIX", force), fetchDailyCloses("^VIX", "6mo")]);
  if (!q.price) return NextResponse.json({ available: false });
  return NextResponse.json({
    available: true,
    vix: q.price,
    changePercent: q.changePercent,
    history: history.map((h) => ({ date: h.date, vix: h.close })),
  });
}
