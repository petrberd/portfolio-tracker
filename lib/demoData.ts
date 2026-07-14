import type { ParsedExport, CashOp } from "./parseXtb";

/**
 * Synthetic portfolio for the public /demo page: real, recognizable tickers so
 * prices/dividends/analyst data/news are genuinely live from Yahoo etc., but
 * every share count, purchase price, and deposit amount is made up — none of
 * it is Petr's real account data. Approximate USD/CZK ~23 used to derive CZK
 * amounts; illustrative only, not meant to be historically precise.
 */

const FX = 23;

interface Buy {
  ticker: string;
  instrument: string;
  date: string; // YYYY-MM-DD
  shares: number;
  price: number; // native currency (USD)
}

const BUYS: Buy[] = [
  { ticker: "AAPL.US", instrument: "Apple", date: "2024-01-15", shares: 8, price: 185 },
  { ticker: "AAPL.US", instrument: "Apple", date: "2024-07-10", shares: 5, price: 210 },
  { ticker: "AAPL.US", instrument: "Apple", date: "2025-03-05", shares: 4, price: 235 },
  { ticker: "MSFT.US", instrument: "Microsoft", date: "2024-02-20", shares: 4, price: 405 },
  { ticker: "MSFT.US", instrument: "Microsoft", date: "2025-01-15", shares: 3, price: 430 },
  { ticker: "NVDA.US", instrument: "Nvidia", date: "2024-01-25", shares: 20, price: 55 },
  { ticker: "NVDA.US", instrument: "Nvidia", date: "2024-09-10", shares: 10, price: 118 },
  { ticker: "AMZN.US", instrument: "Amazon", date: "2024-04-12", shares: 6, price: 180 },
  { ticker: "AMZN.US", instrument: "Amazon", date: "2025-05-20", shares: 4, price: 205 },
  { ticker: "KO.US", instrument: "Coca-Cola", date: "2024-03-08", shares: 30, price: 60 },
  { ticker: "JNJ.US", instrument: "Johnson & Johnson", date: "2024-05-15", shares: 15, price: 150 },
  { ticker: "O.US", instrument: "Realty Income", date: "2024-06-18", shares: 40, price: 58 },
  { ticker: "DIS.US", instrument: "Disney", date: "2024-08-22", shares: 12, price: 90 },
  { ticker: "AAPL.US", instrument: "Apple", date: "2026-01-20", shares: 3, price: 245 },
  { ticker: "AAPL.US", instrument: "Apple", date: "2026-04-15", shares: 3, price: 252 },
  { ticker: "MSFT.US", instrument: "Microsoft", date: "2026-02-10", shares: 2, price: 445 },
  { ticker: "NVDA.US", instrument: "Nvidia", date: "2026-01-12", shares: 8, price: 155 },
  { ticker: "NVDA.US", instrument: "Nvidia", date: "2026-05-05", shares: 6, price: 168 },
  { ticker: "AMZN.US", instrument: "Amazon", date: "2026-03-18", shares: 3, price: 215 },
  { ticker: "KO.US", instrument: "Coca-Cola", date: "2026-02-25", shares: 10, price: 65 },
  { ticker: "O.US", instrument: "Realty Income", date: "2026-04-08", shares: 15, price: 60 },
];

/** Partial NVDA sell after its big run-up, so realized P/L shows up too. */
const SELLS: Buy[] = [{ ticker: "NVDA.US", instrument: "Nvidia", date: "2025-11-05", shares: 8, price: 145 }];

// Quarterly (or monthly for the REIT) dividend payers, with an approximate
// per-payment gross amount in CZK and a ~15% withholding tax deducted.
const DIVIDEND_PAYERS: { ticker: string; instrument: string; grossCzk: number; months: number[] }[] = [
  { ticker: "AAPL.US", instrument: "Apple", grossCzk: 180, months: [2, 5, 8, 11] },
  { ticker: "MSFT.US", instrument: "Microsoft", grossCzk: 420, months: [3, 6, 9, 12] },
  { ticker: "KO.US", instrument: "Coca-Cola", grossCzk: 950, months: [4, 7, 10, 1] },
  { ticker: "JNJ.US", instrument: "Johnson & Johnson", grossCzk: 780, months: [3, 6, 9, 12] },
  { ticker: "DIS.US", instrument: "Disney", grossCzk: 260, months: [1, 7] },
  { ticker: "O.US", instrument: "Realty Income", grossCzk: 340, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

function iso(date: string): string {
  return `${date}T10:00:00.000Z`;
}

function id(prefix: string, i: number): string {
  return `demo-${prefix}-${i}`;
}

export function buildDemoExport(): ParsedExport {
  const cashOps: CashOp[] = [];
  let i = 0;

  // Monthly deposits, 2024-01 through 2026-07 (current month).
  for (let y = 2024; y <= 2026; y++) {
    const lastMonth = y === 2026 ? 7 : 12;
    for (let m = 1; m <= lastMonth; m++) {
      const date = `${y}-${String(m).padStart(2, "0")}-05`;
      // An opening lump-sum transfer big enough to cover every buy below up front
      // (total ~414k CZK), then smaller regular top-ups — otherwise cumulative
      // buys can outrun cumulative deposits-so-far partway through the timeline,
      // which implies a near-zero/negative balance and spikes the daily-return-
      // derived risk metrics (e.g. an impossible >100% max drawdown).
      const amount = y === 2024 && m === 1 ? 420000 : 10000 + ((y * 12 + m) % 4) * 1000;
      cashOps.push({
        type: "Deposit",
        ticker: "",
        instrument: "",
        time: iso(date),
        amount,
        id: id("dep", i++),
        comment: "",
      });
    }
  }

  for (const b of BUYS) {
    cashOps.push({
      type: "Stock purchase",
      ticker: b.ticker,
      instrument: b.instrument,
      time: iso(b.date),
      amount: -(b.shares * b.price * FX),
      id: id("buy", i++),
      comment: `OPEN BUY ${b.shares} @ ${b.price}`,
      volume: b.shares,
      nativePrice: b.price,
    });
  }

  for (const s of SELLS) {
    cashOps.push({
      type: "Stock sell",
      ticker: s.ticker,
      instrument: s.instrument,
      time: iso(s.date),
      amount: s.shares * s.price * FX,
      id: id("sell", i++),
      comment: `CLOSE SELL ${s.shares} @ ${s.price}`,
      volume: s.shares,
      nativePrice: s.price,
    });
  }

  for (const p of DIVIDEND_PAYERS) {
    for (const y of [2024, 2025, 2026]) {
      for (const m of p.months) {
        // Skip payments before the position existed, or after today.
        const date = `${y}-${String(m).padStart(2, "0")}-20`;
        const firstBuy = BUYS.find((b) => b.ticker === p.ticker)?.date ?? "2024-01-01";
        if (date < firstBuy || date > "2026-07-14") continue;
        cashOps.push({
          type: "Dividend",
          ticker: p.ticker,
          instrument: p.instrument,
          time: iso(date),
          amount: p.grossCzk,
          id: id("div", i++),
          comment: "",
        });
        cashOps.push({
          type: "Withholding tax",
          ticker: p.ticker,
          instrument: p.instrument,
          time: iso(date),
          amount: -Math.round(p.grossCzk * 0.15),
          id: id("wht", i++),
          comment: "",
        });
      }
    }
  }

  return {
    accountNumber: "DEMO-000001",
    cashOps,
    closedPositions: [],
  };
}
