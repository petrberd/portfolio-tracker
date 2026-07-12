import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchDailyCloses, yahooSymbol } from "@/lib/prices";
import { loadExport } from "@/lib/store";
import { fetchFundamentals } from "@/lib/fundamentals";
import { fetchAnalysts } from "@/lib/analysts";
import { fetchNews } from "@/lib/news";
import { fetchInsiderTransactions } from "@/lib/nasdaqInsider";
import { fetchDividendMeta } from "@/lib/divcalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the stock detail view needs, in one call. Keyed by XTB ticker —
 * except wishlist items, which aren't real holdings and so have no XTB ticker
 * to convert; `resolved=1` says `ticker` is already a Yahoo symbol, skip
 * `yahooSymbol()`. Either way, "your trades" only matches real XTB tickers in
 * the import, so a wishlist symbol simply shows no trades (as intended).
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim();
  const resolved = req.nextUrl.searchParams.get("resolved") === "1";
  if (!ticker) {
    return NextResponse.json({ error: "Chybí parametr ticker." }, { status: 400 });
  }
  const symbol = resolved ? ticker : yahooSymbol(ticker);

  const [chart, dailyHistory, stored, fundamentals, analysts, news, insider, dividend] = await Promise.all([
    fetchChart(symbol),
    fetchDailyCloses(symbol, "2y"),
    loadExport(),
    fetchFundamentals(symbol),
    fetchAnalysts(symbol),
    fetchNews(symbol),
    fetchInsiderTransactions(symbol),
    fetchDividendMeta(symbol),
  ]);

  // Daily price history for the last ~2 years.
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  const cut = cutoff.toISOString().slice(0, 10);
  const history = dailyHistory.length ? dailyHistory : (chart?.closes ?? []).filter((c) => c.date >= cut);

  // The user's own buys/sells of this ticker, from the imported export.
  const trades = (stored?.cashOps ?? [])
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
