import type { ParsedExport } from "./parseXtb";
import { yahooSymbol, fetchChart, fetchFxCzk, fetchDailyCloses } from "./prices";
import { getExternalDisposals } from "./transfers";

export interface ValuePoint {
  date: string; // YYYY-MM-DD
  value: number; // total portfolio value = stock holdings + cash (CZK) — used for performance
  market: number; // market value of stock holdings only (CZK) — shown in the value chart
  costBasis: number; // FIFO cost basis of holdings held on this day (CZK) — the chart's baseline
  invested: number; // net invested capital (cumulative deposits - withdrawals) in CZK
}

interface TradeEvent {
  date: string;
  ticker: string;
  volume: number; // shares
  cost?: number; // CZK paid (buys only)
  sell?: boolean;
}

/**
 * Build a daily time series of portfolio market value (CZK) vs. net invested
 * capital. Combines the transaction-derived daily share counts per ticker with
 * historical daily closes from Yahoo and a (current) FX rate per currency.
 */
export async function buildValueSeries(data: ParsedExport, force = false): Promise<ValuePoint[]> {
  const ops = [...data.cashOps].filter((o) => o.time).sort((a, b) => a.time.localeCompare(b.time));
  if (!ops.length) return [];

  const startDate = ops[0].time.slice(0, 10);

  // 1. Buy/sell events per ticker over time (with CZK cost for FIFO cost basis).
  const trades: TradeEvent[] = [];
  const tickers = new Set<string>();
  for (const op of ops) {
    if (op.type === "Stock purchase" && op.ticker && op.volume) {
      trades.push({ date: op.time.slice(0, 10), ticker: op.ticker, volume: op.volume, cost: Math.abs(op.amount) });
      tickers.add(op.ticker);
    } else if (op.type === "Stock sell" && op.ticker && op.volume) {
      trades.push({ date: op.time.slice(0, 10), ticker: op.ticker, volume: op.volume, sell: true });
      tickers.add(op.ticker);
    }
  }

  // Shares that left outside Cash Operations (e.g. gifted away) — same effect
  // on the held-shares count as a sell, but tracked separately from cash ops.
  for (const d of getExternalDisposals(data)) {
    trades.push({ date: d.date.slice(0, 10), ticker: d.ticker, volume: d.volume, sell: true });
    tickers.add(d.ticker);
  }

  // 2. Chart (history + currency) per ticker, fetched in parallel.
  const rateByTicker = new Map<string, number>();
  const chartResults = await Promise.all(
    [...tickers].map(async (t) => ({ ticker: t, chart: await fetchChart(yahooSymbol(t), force) }))
  );

  // Convert each ticker's native price to CZK with a (current) FX rate.
  const currencies = [...new Set(chartResults.map((r) => r.chart?.currency ?? "USD"))];
  const fxByCcy = new Map<string, number>();
  await Promise.all(currencies.map(async (c) => fxByCcy.set(c, await fetchFxCzk(c, force))));

  const histByTicker = new Map<string, Map<string, number>>();
  for (const { ticker, chart } of chartResults) {
    rateByTicker.set(ticker, fxByCcy.get(chart?.currency ?? "USD") ?? 21);
    const m = new Map<string, number>();
    for (const h of chart?.closes ?? []) {
      if (h.date >= startDate) m.set(h.date, h.close);
    }
    histByTicker.set(ticker, m);
  }

  // 3. Build the daily calendar from start to today.
  const days = enumerateDays(startDate);

  // 4. Per-day cash-balance change (every op moves cash) and per-day net
  //    external contributions (deposits + withdrawals only).
  const cashByDay = new Map<string, number>();
  const flowByDay = new Map<string, number>();
  for (const op of ops) {
    const d = op.time.slice(0, 10);
    cashByDay.set(d, (cashByDay.get(d) ?? 0) + op.amount); // amount is signed
    if (op.type === "Deposit" || op.type === "Withdrawal") {
      flowByDay.set(d, (flowByDay.get(d) ?? 0) + op.amount);
    }
  }

  // 5. Walk the calendar, carrying forward FIFO lots (shares + CZK cost), cash
  //    and last prices. Cost basis = remaining lot cost of shares still held;
  //    total value = stock holdings + cash.
  type Lot = { shares: number; czkCost: number };
  const lotsByTicker = new Map<string, Lot[]>();
  const lastClose = new Map<string, number>();
  const tradesByDay = new Map<string, TradeEvent[]>();
  for (const t of trades) {
    const arr = tradesByDay.get(t.date) ?? [];
    arr.push(t);
    tradesByDay.set(t.date, arr);
  }

  let invested = 0;
  let cash = 0;
  const series: ValuePoint[] = [];
  for (const day of days) {
    for (const t of tradesByDay.get(day) ?? []) {
      const lots = lotsByTicker.get(t.ticker) ?? [];
      if (t.sell) {
        let remaining = t.volume;
        while (remaining > 1e-9 && lots.length) {
          const lot = lots[0];
          const take = Math.min(lot.shares, remaining);
          const frac = take / lot.shares;
          lot.czkCost -= lot.czkCost * frac;
          lot.shares -= take;
          remaining -= take;
          if (lot.shares <= 1e-9) lots.shift();
        }
      } else {
        lots.push({ shares: t.volume, czkCost: t.cost ?? 0 });
      }
      lotsByTicker.set(t.ticker, lots);
    }
    invested += flowByDay.get(day) ?? 0;
    cash += cashByDay.get(day) ?? 0;

    let stockValue = 0;
    let costBasis = 0;
    for (const [ticker, lots] of lotsByTicker) {
      const sh = lots.reduce((s, l) => s + l.shares, 0);
      if (sh <= 1e-6) continue;
      costBasis += lots.reduce((s, l) => s + l.czkCost, 0);
      const hist = histByTicker.get(ticker);
      const close = hist?.get(day);
      if (close != null) lastClose.set(ticker, close);
      const px = lastClose.get(ticker);
      if (px != null) stockValue += sh * px * (rateByTicker.get(ticker) ?? 23);
    }
    const value = stockValue + cash;
    if (value !== 0 || invested !== 0) series.push({ date: day, value, market: stockValue, costBasis, invested });
  }

  return series;
}

function enumerateDays(startIso: string): string[] {
  const out: string[] = [];
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date();
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface PerfPoint {
  period: string; // "YYYY-MM" or "YYYY"
  gain: number; // money gain/loss in CZK over the period (contributions removed)
  gainPct: number; // time-weighted return (TWR) % — independent of deposit timing/size
}

/**
 * Per-period portfolio performance.
 *   - `gain`   = change in total value minus net contributions (CZK actually made).
 *   - `gainPct`= time-weighted return: the product of daily returns, where each
 *                daily return strips out that day's external cashflow. TWR is the
 *                industry standard for "how did the investments perform" because,
 *                unlike money-weighted returns, it is unaffected by when or how
 *                much money was deposited/withdrawn.
 */
export function computePerformance(series: ValuePoint[]): { monthly: PerfPoint[]; yearly: PerfPoint[] } {
  if (series.length < 2) return { monthly: [], yearly: [] };

  // Daily time-weighted returns (from the previous point to this one).
  const daily: { date: string; ret: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    const v0 = series[i - 1].value;
    const flow = series[i].invested - series[i - 1].invested; // external cashflow that day
    const ret = v0 > 1000 ? (series[i].value - v0 - flow) / v0 : 0;
    daily.push({ date: series[i].date, ret });
  }

  const aggregate = (keyFn: (date: string) => string): PerfPoint[] => {
    const lastByPeriod = new Map<string, ValuePoint>();
    for (const p of series) lastByPeriod.set(keyFn(p.date), p); // series is sorted asc
    const twrByPeriod = new Map<string, number>();
    for (const dr of daily) {
      const k = keyFn(dr.date);
      twrByPeriod.set(k, (twrByPeriod.get(k) ?? 1) * (1 + dr.ret));
    }
    const periods = [...lastByPeriod.keys()].sort();
    const res: PerfPoint[] = [];
    let prev = series[0]; // baseline for the first period's gain
    for (const per of periods) {
      const end = lastByPeriod.get(per)!;
      const gain = end.value - prev.value - (end.invested - prev.invested);
      const twr = (twrByPeriod.get(per) ?? 1) - 1;
      res.push({ period: per, gain, gainPct: twr * 100 });
      prev = end;
    }
    return res;
  };

  return {
    monthly: aggregate((d) => d.slice(0, 7)),
    yearly: aggregate((d) => d.slice(0, 4)),
  };
}

/** Daily time-weighted returns of the portfolio (external cashflow removed). */
function dailyTwr(series: ValuePoint[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const v0 = series[i - 1].value;
    const flow = series[i].invested - series[i - 1].invested;
    if (v0 > 1000) r.push((series[i].value - v0 - flow) / v0);
  }
  return r;
}

export interface RiskMetrics {
  volatility: number; // annualized, fraction
  maxDrawdown: number; // negative fraction
  sharpe: number;
  annualizedReturn: number; // time-weighted, fraction
}

/** Volatility, max drawdown and Sharpe from the portfolio's daily TWR series. */
export function computeRiskMetrics(series: ValuePoint[]): RiskMetrics | null {
  const r = dailyTwr(series);
  if (r.length < 20) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  let idx = 1,
    peak = 1,
    maxDrawdown = 0;
  for (const x of r) {
    idx *= 1 + x;
    peak = Math.max(peak, idx);
    maxDrawdown = Math.min(maxDrawdown, (idx - peak) / peak);
  }
  const years = r.length / 252;
  // Guard Math.pow against a non-positive cumulative index (would yield NaN).
  const annualizedReturn = years > 0 && idx > 0 ? Math.pow(idx, 1 / years) - 1 : 0;
  const rf = 0.03; // assumed risk-free rate
  const sharpe = volatility > 0 ? (annualizedReturn - rf) / volatility : 0;
  // Never emit NaN/Infinity — JSON serializes those to null and crashes the UI.
  const fin = (x: number) => (Number.isFinite(x) ? x : 0);
  return { volatility: fin(volatility), maxDrawdown: fin(maxDrawdown), sharpe: fin(sharpe), annualizedReturn: fin(annualizedReturn) };
}

export interface BenchmarkPoint {
  date: string;
  portfolio: number; // cumulative TWR index, rebased to 100
  sp500: number; // S&P 500 index, rebased to 100
}

/** Portfolio TWR vs. S&P 500, both rebased to 100 at the first shared date. */
export async function buildBenchmark(series: ValuePoint[]): Promise<BenchmarkPoint[]> {
  if (series.length < 2) return [];
  const spCloses = await fetchDailyCloses("^GSPC", "2y");
  if (!spCloses.length) return [];
  const spByDate = new Map(spCloses.map((c) => [c.date, c.close]));

  const out: BenchmarkPoint[] = [];
  let idx = 1,
    sp0: number | undefined,
    lastSp: number | undefined,
    started = false;
  for (let i = 0; i < series.length; i++) {
    const d = series[i].date;
    const sp = spByDate.get(d) ?? lastSp;
    if (sp != null) lastSp = sp;
    if (sp == null) continue;
    if (!started) {
      started = true;
      sp0 = sp;
      idx = 1;
      out.push({ date: d, portfolio: 100, sp500: 100 });
      continue;
    }
    const v0 = series[i - 1].value;
    const flow = series[i].invested - series[i - 1].invested;
    if (v0 > 1000) idx *= 1 + (series[i].value - v0 - flow) / v0;
    out.push({ date: d, portfolio: idx * 100, sp500: (sp / (sp0 as number)) * 100 });
  }
  return out;
}
