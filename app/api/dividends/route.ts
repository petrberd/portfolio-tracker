import { NextRequest, NextResponse } from "next/server";
import { loadExport } from "@/lib/store";
import { reconstructPortfolio } from "@/lib/positions";
import { fetchChart, fetchFxCzk } from "@/lib/prices";
import { fetchDividendMeta, projectPayments } from "@/lib/divcalendar";
import { loadCash, monthlyNetInterest } from "@/lib/cash";
import { getExternalDisposals } from "@/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Projected dividend income over the next 12 months from current holdings. */
export async function GET(req: NextRequest) {
  const stored = await loadExport();
  if (!stored) return NextResponse.json({ available: false });
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  const { holdings } = reconstructPortfolio(stored);

  // Currency + dividend schedule per holding, in parallel.
  const enriched = await Promise.all(
    holdings.map(async (h) => {
      const [chart, meta] = await Promise.all([fetchChart(h.symbol), fetchDividendMeta(h.symbol, force)]);
      return { h, currency: chart?.currency ?? "USD", meta };
    })
  );

  const currencies = [...new Set(enriched.map((e) => e.currency))];
  const fx = new Map<string, number>();
  await Promise.all(currencies.map(async (c) => fx.set(c, await fetchFxCzk(c))));

  interface Payment {
    ticker: string;
    instrument: string;
    exDate: string;
    payDate: string;
    perShare: number;
    currency: string;
    shares: number;
    incomeCzk: number;
    estimatedPay: boolean;
    source: string;
    kind: "dividend" | "interest";
  }

  // Shares held as of a given date (dividend eligibility is set at the ex-date,
  // not today — shares bought after the ex-date don't earn that payment).
  const disposals = getExternalDisposals(stored);
  const sharesAsOf = (ticker: string, cutoffIso: string): number => {
    let s = 0;
    for (const o of stored.cashOps) {
      if (o.ticker !== ticker || !o.time || o.time.slice(0, 10) > cutoffIso) continue;
      if (o.type === "Stock purchase") s += o.volume ?? 0;
      else if (o.type === "Stock sell") s -= o.volume ?? 0;
    }
    for (const d of disposals) {
      if (d.ticker === ticker && d.date.slice(0, 10) <= cutoffIso) s -= d.volume;
    }
    return s;
  };

  const payments: Payment[] = [];
  for (const { h, currency, meta } of enriched) {
    if (!meta) continue;
    const rate = fx.get(currency) ?? 21;
    for (const p of projectPayments(meta, 12)) {
      const qualifyingShares = sharesAsOf(h.ticker, p.exDate); // eligible shares at ex-date
      if (qualifyingShares <= 1e-6) continue;
      payments.push({
        ticker: h.ticker,
        instrument: h.instrument,
        exDate: p.exDate,
        payDate: p.payDate,
        perShare: p.perShare,
        currency,
        shares: qualifyingShares,
        incomeCzk: p.perShare * qualifyingShares * rate,
        estimatedPay: p.estimatedPay,
        source: meta.source,
        kind: "dividend",
      });
    }
  }

  // Fixed 12-month window starting NEXT month (e.g. run in 2026-07 → window 2026-08..2027-07).
  // The current month is skipped since it's typically already (partly) in the past.
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 1; i <= 12; i++) {
    monthKeys.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  }
  const windowSet = new Set(monthKeys);
  const startMonth = monthKeys[0];

  // Interest from external savings accounts: net of withholding tax, credited on
  // the 1st of each month in the window.
  const cash = await loadCash();
  for (const acc of cash.accounts) {
    if (acc.ratePct <= 0 || acc.balance <= 0) continue;
    const net = monthlyNetInterest(acc, cash.interestTaxPct);
    for (const m of monthKeys) {
      const date = `${m}-01`;
      payments.push({
        ticker: `CASH:${acc.name}`,
        instrument: `${acc.name} (úrok)`,
        exDate: date,
        payDate: date,
        perShare: 0,
        currency: "CZK",
        shares: 0,
        incomeCzk: net,
        estimatedPay: false,
        source: "cash",
        kind: "interest",
      });
    }
  }

  payments.sort((a, b) => a.payDate.localeCompare(b.payDate));

  // Only payments landing within the window; bucket by pay-date month.
  const inWindow = payments.filter((p) => windowSet.has(p.payDate.slice(0, 7)));
  const byMonthMap = new Map<string, number>(monthKeys.map((m) => [m, 0]));
  for (const p of inWindow) byMonthMap.set(p.payDate.slice(0, 7), (byMonthMap.get(p.payDate.slice(0, 7)) ?? 0) + p.incomeCzk);
  const byMonth = monthKeys.map((month) => ({ month, income: byMonthMap.get(month) ?? 0 }));
  const annualIncomeCzk = inWindow.reduce((s, p) => s + p.incomeCzk, 0);
  const dividendCzk = inWindow.filter((p) => p.kind === "dividend").reduce((s, p) => s + p.incomeCzk, 0);
  const interestCzk = inWindow.filter((p) => p.kind === "interest").reduce((s, p) => s + p.incomeCzk, 0);

  // Per-source breakdown (stacked by ticker/account) for the projection chart,
  // same shape as the "Dividendy v čase" stacked chart (month + one key per source).
  const totalsBySource = new Map<string, number>();
  const instrumentBySource = new Map<string, string>();
  for (const p of inWindow) {
    totalsBySource.set(p.ticker, (totalsBySource.get(p.ticker) ?? 0) + p.incomeCzk);
    instrumentBySource.set(p.ticker, p.instrument);
  }
  const TOP = 8;
  const rankedSources = [...totalsBySource.entries()].sort((a, b) => b[1] - a[1]);
  const topSources = rankedSources.slice(0, TOP).map(([t]) => t);
  const isTopSource = new Set(topSources);
  const byMonthMapPerSource = new Map<string, Map<string, number>>(monthKeys.map((m) => [m, new Map()]));
  for (const p of inWindow) {
    const month = p.payDate.slice(0, 7);
    const key = isTopSource.has(p.ticker) ? p.ticker : "__other";
    const m = byMonthMapPerSource.get(month)!;
    m.set(key, (m.get(key) ?? 0) + p.incomeCzk);
  }
  const byMonthBreakdown = monthKeys.map((month) => ({ month, ...Object.fromEntries(byMonthMapPerSource.get(month)!) }));
  const incomeSources = topSources.map((t) => ({ ticker: t, instrument: instrumentBySource.get(t) ?? t }));
  if (rankedSources.length > TOP) incomeSources.push({ ticker: "__other", instrument: "Ostatní" });

  return NextResponse.json({
    available: true,
    annualIncomeCzk,
    dividendCzk,
    interestCzk,
    byMonth,
    byMonthBreakdown,
    incomeSources,
    payments: inWindow,
    windowStart: startMonth,
    payers: new Set(inWindow.map((p) => p.ticker)).size,
  });
}
