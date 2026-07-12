import { NextRequest, NextResponse } from "next/server";
import { buildDemoExport } from "@/lib/demoData";
import { reconstructPortfolio, type Holding } from "@/lib/positions";
import { fetchQuote, fetchFxCzk } from "@/lib/prices";
import { buildValueSeries, computePerformance, computeRiskMetrics, buildBenchmark } from "@/lib/timeseries";
import { fetchProfile } from "@/lib/finnhub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EnrichedHolding extends Holding {
  currency: string;
  livePrice: number;
  dayChangePercent: number;
  marketValueCzk: number;
  unrealizedPnlCzk: number;
  unrealizedPnlPct: number;
  sector: string;
  dividendTtmCzk: number;
  yieldOnCostPct: number;
}

function trailingDividends(stored: { cashOps: { type: string; ticker: string; amount: number; time: string }[] }): Map<string, number> {
  const times = stored.cashOps.map((o) => o.time).filter(Boolean).sort();
  const latest = times.length ? new Date(times[times.length - 1]) : new Date();
  const cutoff = new Date(latest);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const cut = cutoff.toISOString();
  const map = new Map<string, number>();
  for (const o of stored.cashOps) {
    if ((o.type === "Dividend" || o.type === "Withholding tax") && o.ticker && o.time >= cut) {
      map.set(o.ticker, (map.get(o.ticker) ?? 0) + o.amount);
    }
  }
  return map;
}

/** Same shape as /api/portfolio, but backed by the synthetic demo dataset (real tickers, made-up amounts). */
export async function GET(req: NextRequest) {
  const stored = buildDemoExport();
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  const summary = reconstructPortfolio(stored);

  const quotes = await Promise.all(summary.holdings.map((h) => fetchQuote(h.symbol, force)));
  const currencies = [...new Set(quotes.map((q) => q.currency))];
  const fx = new Map<string, number>();
  await Promise.all(currencies.map(async (c) => fx.set(c, await fetchFxCzk(c, force))));

  const profiles = await Promise.all(summary.holdings.map((h) => fetchProfile(h.symbol)));
  const divTtm = trailingDividends(stored);

  const holdings: EnrichedHolding[] = summary.holdings.map((h, i) => {
    const q = quotes[i];
    const rate = fx.get(q.currency) ?? 21;
    const marketValueCzk = h.shares * q.price * rate;
    const unrealizedPnlCzk = marketValueCzk - h.czkCostBasis;
    const dividendTtmCzk = divTtm.get(h.ticker) ?? 0;
    return {
      ...h,
      currency: q.currency,
      livePrice: q.price,
      dayChangePercent: q.changePercent,
      marketValueCzk,
      unrealizedPnlCzk,
      unrealizedPnlPct: h.czkCostBasis > 0 ? (unrealizedPnlCzk / h.czkCostBasis) * 100 : 0,
      sector: profiles[i]?.sector ?? "Ostatní",
      dividendTtmCzk,
      yieldOnCostPct: h.czkCostBasis > 0 ? (dividendTtmCzk / h.czkCostBasis) * 100 : 0,
    };
  });

  const totalMarketValue = holdings.reduce((s, h) => s + h.marketValueCzk, 0);
  const totalUnrealized = holdings.reduce((s, h) => s + h.unrealizedPnlCzk, 0);

  let series: Awaited<ReturnType<typeof buildValueSeries>> = [];
  try {
    series = await buildValueSeries(stored, force);
  } catch (e) {
    console.error("demo buildValueSeries failed", e);
  }
  const performance = computePerformance(series);
  const risk = computeRiskMetrics(series);
  let benchmark: Awaited<ReturnType<typeof buildBenchmark>> = [];
  try {
    benchmark = await buildBenchmark(series);
  } catch (e) {
    console.error("demo buildBenchmark failed", e);
  }

  const dividendTtmTotal = holdings.reduce((s, h) => s + h.dividendTtmCzk, 0);

  return NextResponse.json({
    imported: true,
    importedAt: new Date().toISOString(),
    accountNumber: stored.accountNumber,
    summary: {
      ...summary,
      totalMarketValue,
      totalUnrealized,
      totalUnrealizedPct: summary.totalCostBasis > 0 ? (totalUnrealized / summary.totalCostBasis) * 100 : 0,
      netInvested: summary.totalDeposits + summary.totalWithdrawals,
      dividendTtmTotal,
      dividendYieldOnCostPct: summary.totalCostBasis > 0 ? (dividendTtmTotal / summary.totalCostBasis) * 100 : 0,
      dividendForwardYieldPct: totalMarketValue > 0 ? (dividendTtmTotal / totalMarketValue) * 100 : 0,
      freeCash: 0,
      cashAccounts: [],
    },
    holdings,
    series,
    performance,
    risk,
    benchmark,
  });
}
