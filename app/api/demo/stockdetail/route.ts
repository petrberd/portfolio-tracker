import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchDailyCloses, rangeCutoffDate, rangeIntradayInterval, yahooSymbol } from "@/lib/prices";
import { buildDemoExport } from "@/lib/demoData";
import { fetchFundamentals } from "@/lib/fundamentals";
import { fetchAnalysts } from "@/lib/analysts";
import { fetchNews } from "@/lib/news";
import { fetchInsiderTransactions } from "@/lib/nasdaqInsider";
import { fetchDividendMeta } from "@/lib/divcalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(["1mo", "3mo", "1y", "5y"]);

/** Same shape as /api/stockdetail, but "tvé obchody" come from the synthetic demo dataset.
 * `resolved=1` (sent by the wishlist — see lib/prices.ts's yahooSymbol doc) says `ticker`
 * is already a Yahoo symbol, skip re-resolving it. `range` (1mo/3mo/1y/5y, default 1y)
 * picks how far back the price chart goes. */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return NextResponse.json({ error: "Chybí parametr ticker." }, { status: 400 });
  }
  const resolved = req.nextUrl.searchParams.get("resolved") === "1";
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1y";
  const range = VALID_RANGES.has(rangeParam) ? rangeParam : "1y";
  const symbol = resolved ? ticker : yahooSymbol(ticker);
  const stored = buildDemoExport();

  const interval = rangeIntradayInterval(range);
  const [chart, dailyHistory, fundamentals, analysts, news, insider, dividend] = await Promise.all([
    fetchChart(symbol),
    fetchDailyCloses(symbol, range, interval),
    fetchFundamentals(symbol),
    fetchAnalysts(symbol),
    fetchNews(symbol),
    fetchInsiderTransactions(symbol),
    fetchDividendMeta(symbol),
  ]);

  const cut = rangeCutoffDate(range);
  const history = dailyHistory.length ? dailyHistory : (chart?.closes ?? []).filter((c) => c.date >= cut);

  const trades = stored.cashOps
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
