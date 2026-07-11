import * as XLSX from "xlsx";
import type { CashOp, ParsedExport } from "./parseXtb";

/**
 * Parses a Revolut "Stocks" account statement CSV into the same `ParsedExport`
 * shape XTB import produces, so the rest of the app (FIFO reconstruction,
 * dividends, timeseries) works unchanged regardless of broker.
 *
 * Columns: Date, Ticker, Type, Quantity, Price per share, Total Amount, Currency, FX Rate.
 * Money fields carry the currency as a text prefix ("EUR 150", "USD 25.19").
 * `FX Rate` converts to CZK as `amount / FX Rate` (empirically verified against
 * real transactions: e.g. "EUR 150" @ FX 0.0413 -> ~3631 CZK, matching the real
 * EUR/CZK rate of the period) — Revolut's own per-transaction historical rate,
 * more precise than reconstructing it separately.
 *
 * Known limitation: Revolut tickers have no exchange suffix (unlike XTB's
 * "MU.US"), so a European-listed ticker may not resolve on Yahoo Finance the
 * same way a US one does — passed through as-is (best effort), same fallback
 * lib/prices.ts's yahooSymbol() already uses for unmapped suffixes.
 */

const TYPE_MAP: Record<string, string> = {
  "CASH TOP-UP": "Deposit",
  "CASH WITHDRAWAL": "Withdrawal",
  "BUY - MARKET": "Stock purchase",
  "BUY - LIMIT": "Stock purchase",
  "SELL - MARKET": "Stock sell",
  "SELL - LIMIT": "Stock sell",
  DIVIDEND: "Dividend",
  "DIVIDEND TAX": "Withholding tax",
  "CUSTODY FEE": "SEC fee",
};

/** "EUR 150" / "USD 25.19" -> 150 / 25.19 (also handles a plain number). */
function parseMoney(v: unknown): number {
  const s = String(v ?? "").trim();
  const m = s.match(/^[A-Z]{3}\s*(-?[\d.,]+)$/);
  const n = parseFloat((m ? m[1] : s).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function num(v: unknown): number | undefined {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? undefined : n;
}

export function parseRevolutCsv(csvText: string): ParsedExport {
  const wb = XLSX.read(csvText, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });

  const cashOps: CashOp[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawType = String(r?.[2] ?? "").trim();
    if (!rawType) continue;

    const mappedType = TYPE_MAP[rawType.toUpperCase()] ?? rawType;
    const ticker = String(r?.[1] ?? "").trim();
    const time = String(r?.[0] ?? "").trim();
    const iso = time ? new Date(time).toISOString() : "";
    const fxRate = parseFloat(String(r?.[7] ?? ""));
    const totalNative = parseMoney(r?.[5]);
    const czkAmount = fxRate ? totalNative / fxRate : 0;

    const outflow = mappedType === "Stock purchase" || mappedType === "Withdrawal";
    const amount = outflow ? -Math.abs(czkAmount) : Math.abs(czkAmount);

    cashOps.push({
      type: mappedType,
      ticker,
      instrument: ticker,
      time: iso,
      amount,
      id: `revolut-${i}`,
      comment: rawType,
      volume: num(r?.[3]),
      nativePrice: parseMoney(r?.[4]) || undefined,
    });
  }

  return { accountNumber: "Revolut", cashOps, closedPositions: [] };
}
