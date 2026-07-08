import { NextRequest, NextResponse } from "next/server";
import { loadExport } from "@/lib/store";
import { reconstructPortfolio } from "@/lib/positions";
import { fetchChart, fetchFxCzk } from "@/lib/prices";
import { fetchDividendMeta, projectPayments } from "@/lib/divcalendar";
import { loadCash, monthlyNetInterest } from "@/lib/cash";

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
  const sharesAsOf = (ticker: string, cutoffIso: string): number => {
    let s = 0;
    for (const o of stored.cashOps) {
      if (o.ticker !== ticker || !o.time || o.time.slice(0, 10) > cutoffIso) continue;
      if (o.type === "Stock purchase") s += o.volume ?? 0;
      else if (o.type === "Stock sell") s -= o.volume ?? 0;
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

  // Fixed 12-month window starting at the current month (e.g. 2026-07).
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 0; i < 12; i++) {
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

  return NextResponse.json({
    available: true,
    annualIncomeCzk,
    dividendCzk,
    interestCzk,
    byMonth,
    payments: inWindow,
    windowStart: startMonth,
    payers: new Set(inWindow.map((p) => p.ticker)).size,
  });
}
