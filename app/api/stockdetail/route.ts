import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchDailyCloses, rangeCutoffDate, rangeIntradayInterval, yahooSymbol } from "@/lib/prices";
import { loadExport } from "@/lib/store";
import { fetchFundamentals } from "@/lib/fundamentals";
import { fetchAnalysts } from "@/lib/analysts";
import { fetchNews } from "@/lib/news";
import { fetchInsiderTransactions } from "@/lib/nasdaqInsider";
import { fetchDividendMeta } from "@/lib/divcalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(["1mo", "3mo", "1y", "5y"]);

/**
 * Everything the stock detail view needs, in one call. Keyed by XTB ticker —
 * except wishlist items, which aren't real holdings and so have no XTB ticker
 * to convert; `resolved=1` says `ticker` is already a Yahoo symbol, skip
 * `yahooSymbol()`. Either way, "your trades" only matches real XTB tickers in
 * the import, so a wishlist symbol simply shows no trades (as intended).
 * `range` (1mo/3mo/1y/5y, default 1y) picks how far back the price chart goes.
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim();
  const resolved = req.nextUrl.searchParams.get("resolved") === "1";
  if (!ticker) {
    return NextResponse.json({ error: "Chybí parametr ticker." }, { status: 400 });
  }
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1y";
  const range = VALID_RANGES.has(rangeParam) ? rangeParam : "1y";
  const symbol = resolved ? ticker : yahooSymbol(ticker);

  const interval = rangeIntradayInterval(range);
  const [chart, dailyHistory, stored, fundamentals, analysts, news, insider, dividend] = await Promise.all([
    fetchChart(symbol),
    fetchDailyCloses(symbol, range, interval),
    loadExport(),
    fetchFundamentals(symbol),
    fetchAnalysts(symbol),
    fetchNews(symbol),
    fetchInsiderTransactions(symbol),
    fetchDividendMeta(symbol),
  ]);

  // Price history for the selected range (intraday for 1mo/3mo, daily for 1y/5y — see
  // rangeIntradayInterval). The chart-cache fallback is only daily, so on that path trade
  // markers fall back to date-only comparison too, same as before.
  const cut = rangeCutoffDate(range);
  const history = dailyHistory.length ? dailyHistory : (chart?.closes ?? []).filter((c) => c.date >= cut);

  // The user's own buys/sells of this ticker, from the imported export. Kept as a full
  // timestamp (not truncated to the day) so a marker lands at its actual execution time —
  // on an intraday chart that's the difference between landing on the line and floating
  // near it just because the day's close moved on afterward.
  const trades = (stored?.cashOps ?? [])
    .filter((o) => o.ticker === ticker && (o.type === "Stock purchase" || o.type === "Stock sell") && o.volume && o.nativePrice)
    .map((o) => ({
      date: o.time,
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
