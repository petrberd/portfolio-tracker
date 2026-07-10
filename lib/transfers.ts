import type { ParsedExport } from "./parseXtb";

/**
 * XTB logs some position closures only in "Closed Positions" (e.g. gifting
 * shares to someone else via "Send A Gift Transfer Out") — there is no
 * matching "Stock sell" in "Cash Operations", because no cash changes hands.
 * If we only reconstruct holdings from Cash Operations, these shares never
 * leave the FIFO lots and the portfolio overstates what's actually held.
 *
 * This scans Closed Positions for that specific comment and returns the
 * disposals so callers can remove the shares (no proceeds, no realized P/L —
 * it's a gift, not a sale).
 */
export interface ExternalDisposal {
  ticker: string;
  volume: number;
  date: string; // ISO close time
}

const DISPOSAL_COMMENT = "send a gift transfer out";

export function getExternalDisposals(data: ParsedExport): ExternalDisposal[] {
  return data.closedPositions
    .filter((cp) => cp.ticker && cp.volume > 0 && cp.comment.trim().toLowerCase() === DISPOSAL_COMMENT)
    .map((cp) => ({ ticker: cp.ticker, volume: cp.volume, date: cp.closeTime }))
    .filter((d) => d.date);
}
