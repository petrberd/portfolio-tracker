import type { CashOp, ParsedExport } from "./parseXtb";
import { yahooSymbol } from "./prices";

export interface Lot {
  shares: number;
  czkCost: number; // remaining CZK cost basis for these shares
  nativePrice: number;
  time: string;
}

export interface Holding {
  ticker: string; // XTB ticker
  symbol: string; // Stooq symbol
  instrument: string;
  shares: number;
  czkCostBasis: number; // total remaining cost basis in CZK
  avgNativePrice: number; // weighted avg buy price in native ccy
  realizedPnlCzk: number; // realized P/L from sells of this ticker (CZK)
  dividendsCzk: number; // net dividends received (CZK, gross - WHT)
}

export interface CashflowPoint {
  month: string; // YYYY-MM
  deposits: number;
  withdrawals: number;
  dividends: number; // gross
  withholdingTax: number; // negative
  fees: number; // interest tax, sec fee, swap (negative)
  interest: number;
}

export interface PortfolioSummary {
  holdings: Holding[];
  totalDeposits: number;
  totalWithdrawals: number;
  totalDividendsGross: number;
  totalWithholdingTax: number;
  totalInterest: number;
  totalFees: number;
  totalRealizedPnl: number;
  totalCostBasis: number;
  cashflowByMonth: CashflowPoint[];
  dividendByMonth: DividendMonthRow[]; // stacked-by-ticker gross dividends
  dividendTickers: DividendTicker[]; // top payers, for legend/keys
  firstOpDate: string;
  lastOpDate: string;
}

export interface DividendTicker {
  ticker: string;
  instrument: string;
  total: number; // gross CZK
}

// One month with a gross dividend amount per ticker key (+ optional __other).
export type DividendMonthRow = { month: string } & Record<string, number | string>;

const SELL_TYPES = new Set(["Stock sell"]);
const BUY_TYPES = new Set(["Stock purchase"]);

/**
 * Reconstruct current open positions from cash operations using FIFO lot
 * matching (XTB's default accounting). Buys add lots, sells consume the
 * oldest lots first. Remaining lots = the portfolio held today.
 */
export function reconstructPortfolio(data: ParsedExport): PortfolioSummary {
  const ops = [...data.cashOps]
    .filter((o) => o.time)
    .sort((a, b) => a.time.localeCompare(b.time)); // oldest first for FIFO

  const lotsByTicker = new Map<string, Lot[]>();
  const realizedByTicker = new Map<string, number>();
  const dividendsByTicker = new Map<string, number>();
  const instrumentName = new Map<string, string>();
  // Gross dividends broken down by month -> ticker, for the stacked chart.
  const divTickerTotals = new Map<string, number>();
  const divMonthTicker = new Map<string, Map<string, number>>();

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividendsGross = 0;
  let totalWithholdingTax = 0;
  let totalInterest = 0;
  let totalFees = 0;

  const cashflow = new Map<string, CashflowPoint>();
  const monthKey = (iso: string) => iso.slice(0, 7);
  const cf = (iso: string): CashflowPoint => {
    const k = monthKey(iso);
    let p = cashflow.get(k);
    if (!p) {
      p = { month: k, deposits: 0, withdrawals: 0, dividends: 0, withholdingTax: 0, fees: 0, interest: 0 };
      cashflow.set(k, p);
    }
    return p;
  };

  for (const op of ops) {
    if (op.ticker && op.instrument) instrumentName.set(op.ticker, op.instrument);

    switch (op.type) {
      case "Stock purchase": {
        if (!op.ticker || !op.volume) break;
        const lots = lotsByTicker.get(op.ticker) ?? [];
        lots.push({
          shares: op.volume,
          czkCost: Math.abs(op.amount),
          nativePrice: op.nativePrice ?? 0,
          time: op.time,
        });
        lotsByTicker.set(op.ticker, lots);
        break;
      }
      case "Stock sell": {
        if (!op.ticker || !op.volume) break;
        const lots = lotsByTicker.get(op.ticker) ?? [];
        let toSell = op.volume;
        let costRemoved = 0;
        while (toSell > 1e-9 && lots.length) {
          const lot = lots[0];
          const take = Math.min(lot.shares, toSell);
          const frac = take / lot.shares;
          const lotCost = lot.czkCost * frac;
          costRemoved += lotCost;
          lot.shares -= take;
          lot.czkCost -= lotCost;
          toSell -= take;
          if (lot.shares <= 1e-9) lots.shift();
        }
        // Realized P/L = proceeds (CZK) - cost basis removed (CZK)
        const proceeds = op.amount; // positive inflow
        const realized = proceeds - costRemoved;
        realizedByTicker.set(op.ticker, (realizedByTicker.get(op.ticker) ?? 0) + realized);
        break;
      }
      case "Deposit":
        totalDeposits += op.amount;
        cf(op.time).deposits += op.amount;
        break;
      case "Withdrawal":
        totalWithdrawals += op.amount; // negative
        cf(op.time).withdrawals += op.amount;
        break;
      case "Dividend":
        totalDividendsGross += op.amount;
        cf(op.time).dividends += op.amount;
        if (op.ticker) {
          dividendsByTicker.set(op.ticker, (dividendsByTicker.get(op.ticker) ?? 0) + op.amount);
          divTickerTotals.set(op.ticker, (divTickerTotals.get(op.ticker) ?? 0) + op.amount);
          const mk = monthKey(op.time);
          let mm = divMonthTicker.get(mk);
          if (!mm) divMonthTicker.set(mk, (mm = new Map()));
          mm.set(op.ticker, (mm.get(op.ticker) ?? 0) + op.amount);
        }
        break;
      case "Withholding tax":
        totalWithholdingTax += op.amount; // negative
        cf(op.time).withholdingTax += op.amount;
        if (op.ticker) dividendsByTicker.set(op.ticker, (dividendsByTicker.get(op.ticker) ?? 0) + op.amount);
        break;
      case "Free funds interest":
        totalInterest += op.amount;
        cf(op.time).interest += op.amount;
        break;
      case "Free funds interest tax":
      case "SEC fee":
      case "Swap":
      case "Close trade":
        totalFees += op.amount; // typically negative adjustments
        cf(op.time).fees += op.amount;
        break;
      default:
        break;
    }
  }

  const holdings: Holding[] = [];
  let totalCostBasis = 0;
  for (const [ticker, lots] of lotsByTicker) {
    const shares = lots.reduce((s, l) => s + l.shares, 0);
    if (shares <= 1e-6) continue; // fully closed
    const czkCostBasis = lots.reduce((s, l) => s + l.czkCost, 0);
    const nativeWeighted = lots.reduce((s, l) => s + l.nativePrice * l.shares, 0);
    totalCostBasis += czkCostBasis;
    holdings.push({
      ticker,
      symbol: yahooSymbol(ticker),
      instrument: instrumentName.get(ticker) ?? ticker,
      shares,
      czkCostBasis,
      avgNativePrice: shares ? nativeWeighted / shares : 0,
      realizedPnlCzk: realizedByTicker.get(ticker) ?? 0,
      dividendsCzk: dividendsByTicker.get(ticker) ?? 0,
    });
  }
  holdings.sort((a, b) => b.czkCostBasis - a.czkCostBasis);

  const totalRealizedPnl = [...realizedByTicker.values()].reduce((s, v) => s + v, 0);
  const cashflowByMonth = [...cashflow.values()].sort((a, b) => a.month.localeCompare(b.month));

  // Dividend breakdown: keep the top payers as their own stacked series and
  // fold the long tail into "__other" so the legend stays readable.
  const TOP = 8;
  const ranked = [...divTickerTotals.entries()].sort((a, b) => b[1] - a[1]);
  const topTickers = ranked.slice(0, TOP).map(([t]) => t);
  const isTop = new Set(topTickers);
  const dividendByMonth: DividendMonthRow[] = [...divMonthTicker.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, m]) => {
      const row: DividendMonthRow = { month };
      let other = 0;
      for (const [t, v] of m) {
        if (isTop.has(t)) row[t] = ((row[t] as number) ?? 0) + v;
        else other += v;
      }
      if (other > 0) row.__other = other;
      return row;
    });
  const dividendTickers: DividendTicker[] = topTickers.map((t) => ({
    ticker: t,
    instrument: instrumentName.get(t) ?? t,
    total: divTickerTotals.get(t) ?? 0,
  }));
  if (ranked.length > TOP) {
    dividendTickers.push({
      ticker: "__other",
      instrument: "Ostatní",
      total: ranked.slice(TOP).reduce((s, [, v]) => s + v, 0),
    });
  }

  return {
    holdings,
    totalDeposits,
    totalWithdrawals,
    totalDividendsGross,
    totalWithholdingTax,
    totalInterest,
    totalFees,
    totalRealizedPnl,
    totalCostBasis,
    cashflowByMonth,
    dividendByMonth,
    dividendTickers,
    firstOpDate: ops[0]?.time ?? "",
    lastOpDate: ops[ops.length - 1]?.time ?? "",
  };
}
