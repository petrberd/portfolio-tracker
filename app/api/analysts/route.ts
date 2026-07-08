import { NextRequest, NextResponse } from "next/server";
import { fetchChart } from "@/lib/prices";
import { fetchAnalysts } from "@/lib/analysts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  if (!symbol) {
    return NextResponse.json({ error: "Chybí parametr symbol." }, { status: 400 });
  }

  const [chart, analysts] = await Promise.all([fetchChart(symbol, force), fetchAnalysts(symbol, force)]);

  if (!analysts || analysts.count === 0) {
    return NextResponse.json({ available: false, symbol });
  }

  const price = chart?.price ?? 0;
  const currency = chart?.currency ?? "USD";
  const upsidePct = price > 0 && analysts.targetPrice > 0 ? ((analysts.targetPrice - price) / price) * 100 : null;

  return NextResponse.json({ available: true, analysts, price, currency, upsidePct });
}
