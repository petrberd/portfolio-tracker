import { NextRequest, NextResponse } from "next/server";
import { loadExport } from "@/lib/store";
import { reconstructPortfolio, type Holding } from "@/lib/positions";
import { fetchQuote, fetchFxCzk } from "@/lib/prices";
import { buildValueSeries, computePerformance, computeRiskMetrics, buildBenchmark } from "@/lib/timeseries";
import { fetchSector } from "@/lib/sector";
import { loadCash, freeCashTotal } from "@/lib/cash";
import { loadHoldingAlerts } from "@/lib/holdingAlerts";
import { alertTriggered, type PriceAlert } from "@/lib/priceAlert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface EnrichedHolding extends Holding {
  currency: string;
  livePrice: number;
  dayChangePercent: number;
  marketValueCzk: number;
  unrealizedPnlCzk: number;
  unrealizedPnlPct: number;
  sector: string;
  dividendTtmCzk: number; // net dividends received in the trailing 12 months
  yieldOnCostPct: number; // TTM dividend / cost basis
  alert?: PriceAlert;
  alertTriggered: boolean;
}

/** Net dividends (Dividend + Withholding tax) per ticker over the trailing 12 months. */
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

export async function GET(req: NextRequest) {
  const stored = await loadExport();
  if (!stored) {
    return NextResponse.json({ imported: false }, { status: 200 });
  }

  // `?refresh=1` bypasses the price cache to pull genuinely current quotes.
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  const summary = reconstructPortfolio(stored);

  // Live quote (price + day change + currency) per holding, in parallel.
  const quotes = await Promise.all(summary.holdings.map((h) => fetchQuote(h.symbol, force)));

  // FX rate per distinct currency.
  const currencies = [...new Set(quotes.map((q) => q.currency))];
  const fx = new Map<string, number>();
  await Promise.all(currencies.map(async (c) => fx.set(c, await fetchFxCzk(c, force))));

  // Sector per holding (stockanalysis.com, cached, no API key needed) + trailing-12m dividends (from export).
  const sectors = await Promise.all(summary.holdings.map((h) => fetchSector(h.symbol)));
  const divTtm = trailingDividends(stored);
  const holdingAlerts = await loadHoldingAlerts();

  const holdings: EnrichedHolding[] = summary.holdings.map((h, i) => {
    const q = quotes[i];
    const rate = fx.get(q.currency) ?? 21;
    const marketValueCzk = h.shares * q.price * rate;
    const unrealizedPnlCzk = marketValueCzk - h.czkCostBasis;
    const dividendTtmCzk = divTtm.get(h.ticker) ?? 0;
    const alert = holdingAlerts[h.symbol];
    return {
      ...h,
      currency: q.currency,
      livePrice: q.price,
      dayChangePercent: q.changePercent,
      marketValueCzk,
      unrealizedPnlCzk,
      unrealizedPnlPct: h.czkCostBasis > 0 ? (unrealizedPnlCzk / h.czkCostBasis) * 100 : 0,
      sector: sectors[i] ?? "Ostatní",
      dividendTtmCzk,
      yieldOnCostPct: h.czkCostBasis > 0 ? (dividendTtmCzk / h.czkCostBasis) * 100 : 0,
      alert,
      alertTriggered: alertTriggered(alert, q.price),
    };
  });

  const totalMarketValue = holdings.reduce((s, h) => s + h.marketValueCzk, 0);
  const totalUnrealized = holdings.reduce((s, h) => s + h.unrealizedPnlCzk, 0);

  // Value-over-time series (may be slow — Yahoo history per ticker).
  let series: Awaited<ReturnType<typeof buildValueSeries>> = [];
  try {
    series = await buildValueSeries(stored, force);
  } catch (e) {
    console.error("buildValueSeries failed", e);
  }
  const performance = computePerformance(series);
  const risk = computeRiskMetrics(series);
  let benchmark: Awaited<ReturnType<typeof buildBenchmark>> = [];
  try {
    benchmark = await buildBenchmark(series);
  } catch (e) {
    console.error("buildBenchmark failed", e);
  }

  const dividendTtmTotal = holdings.reduce((s, h) => s + h.dividendTtmCzk, 0);
  const cash = await loadCash();
  const freeCash = freeCashTotal(cash);

  return NextResponse.json({
    imported: true,
    importedAt: stored.importedAt,
    sourceFile: stored.sourceFile,
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
      freeCash,
      cashAccounts: cash.accounts,
    },
    holdings,
    series,
    performance,
    risk,
    benchmark,
  });
}
