import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchDailyCloses, yahooSymbol } from "@/lib/prices";
import { buildDemoExport } from "@/lib/demoData";
import { fetchFundamentals } from "@/lib/fundamentals";
import { fetchAnalysts } from "@/lib/analysts";
import { fetchNews } from "@/lib/news";
import { fetchInsiderTransactions } from "@/lib/nasdaqInsider";
import { fetchDividendMeta } from "@/lib/divcalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same shape as /api/stockdetail, but "tvé obchody" come from the synthetic demo dataset. */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return NextResponse.json({ error: "Chybí parametr ticker." }, { status: 400 });
  }
  const symbol = yahooSymbol(ticker);
  const stored = buildDemoExport();

  const [chart, dailyHistory, fundamentals, analysts, news, insider, dividend] = await Promise.all([
    fetchChart(symbol),
    fetchDailyCloses(symbol, "2y"),
    fetchFundamentals(symbol),
    fetchAnalysts(symbol),
    fetchNews(symbol),
    fetchInsiderTransactions(symbol),
    fetchDividendMeta(symbol),
  ]);

  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  const cut = cutoff.toISOString().slice(0, 10);
  const history = dailyHistory.length ? dailyHistory : (chart?.closes ?? []).filter((c) => c.date >= cut);

  const trades = stored.cashOps
    .filter((o) => o.ticker === ticker && (o.type === "Stock purchase" || o.type === "Stock sell") && o.volume && o.nativePrice)
    .map((o) => ({
      date: o.time.slice(0, 10),
      price: o.nativePrice as number,
      volume: o.volume as number,
      side: o.type === "Stock purchase" ? "buy" : "sell",
    }))
    .filter((t) => t.date >= cut);

  return NextResponse.json({
    ticker,
    symbol,
    currency: chart?.currency ?? "USD",
    price: chart?.price ?? 0,
    history,
    trades,
    fundamentals,
    analysts,
    news,
    insider,
    dividend,
  });
}
