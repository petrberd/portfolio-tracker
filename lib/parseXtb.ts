import * as XLSX from "xlsx";

/**
 * Normalized representation of one XTB "Cash Operations" row.
 * Amounts are in the account currency (CZK). Native price/volume are parsed
 * out of the free-text comment when present.
 */
export interface CashOp {
  type: string; // e.g. "Stock purchase", "Dividend", ...
  ticker: string; // e.g. "MU.US" ("" for cash-only ops)
  instrument: string; // human name, e.g. "Micron"
  time: string; // ISO string
  amount: number; // CZK, signed (+in / -out)
  id: string;
  comment: string;
  // Parsed from comment where applicable:
  volume?: number; // shares transacted
  nativePrice?: number; // price per share in the instrument's own currency
}

export interface ClosedPosition {
  instrument: string;
  category: string;
  ticker: string;
  side: string; // BUY / SELL
  volume: number;
  openPrice: number;
  openTime: string;
  closePrice: number;
  closeTime: string;
  profitLoss: number; // CZK
  purchaseValue: number; // CZK
  saleValue: number; // CZK
  positionId: string;
}

export interface ParsedExport {
  accountNumber: string;
  cashOps: CashOp[];
  closedPositions: ClosedPosition[];
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    // Excel serial date fallback
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S))).toISOString();
  }
  if (typeof v === "string" && v.trim()) {
    const parsed = new Date(v);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Volume + native price live in comments like:
 *   "OPEN BUY 0.0709 @ 994.00"
 *   "CLOSE BUY 2/18 @ 21.23"   (the 2 is the closed volume)
 */
function parseTradeComment(comment: string): { volume?: number; nativePrice?: number } {
  if (!comment) return {};
  const m = comment.match(/(OPEN|CLOSE)\s+(?:BUY|SELL)\s+([\d.]+)(?:\/[\d.]+)?\s*@\s*([\d.]+)/i);
  if (m) return { volume: parseFloat(m[2]), nativePrice: parseFloat(m[3]) };
  return {};
}

/** Locate the header row inside an XTB sheet (it has a leading metadata block). */
function findHeaderRow(rows: unknown[][], firstColLabel: string): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (String(rows[i]?.[0] ?? "").trim() === firstColLabel) return i;
  }
  return -1;
}

export function parseXtbWorkbook(buffer: ArrayBuffer | Buffer): ParsedExport {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const cashSheet = wb.Sheets["Cash Operations"];
  const closedSheet = wb.Sheets["Closed Positions"];

  const cashOps: CashOp[] = [];
  let accountNumber = "";

  if (cashSheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(cashSheet, { header: 1, raw: true });
    accountNumber = String(rows[0]?.[1] ?? "");
    const h = findHeaderRow(rows, "Type"); // header: Type, Ticker, Instrument, Time, Amount, ID, Comment, Product
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i];
      const type = String(r?.[0] ?? "").trim();
      if (!type || type === "Total") continue; // skip trailing summary row
      const comment = String(r?.[6] ?? "");
      const { volume, nativePrice } = parseTradeComment(comment);
      cashOps.push({
        type,
        ticker: String(r?.[1] ?? "").trim(),
        instrument: String(r?.[2] ?? "").trim(),
        time: toIso(r?.[3]),
        amount: num(r?.[4]),
        id: String(r?.[5] ?? ""),
        comment,
        volume,
        nativePrice,
      });
    }
  }

  const closedPositions: ClosedPosition[] = [];
  if (closedSheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(closedSheet, { header: 1, raw: true });
    const h = findHeaderRow(rows, "Instrument");
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i];
      const instrument = String(r?.[0] ?? "").trim();
      if (!instrument || instrument === "Total") continue;
      closedPositions.push({
        instrument,
        category: String(r?.[1] ?? "").trim(),
        ticker: String(r?.[2] ?? "").trim(),
        side: String(r?.[3] ?? "").trim(),
        volume: num(r?.[4]),
        openPrice: num(r?.[5]),
        openTime: toIso(r?.[6]),
        closePrice: num(r?.[7]),
        closeTime: toIso(r?.[8]),
        profitLoss: num(r?.[10]),
        purchaseValue: num(r?.[12]),
        saleValue: num(r?.[13]),
        positionId: String(r?.[23] ?? ""),
      });
    }
  }

  return { accountNumber, cashOps, closedPositions };
}
