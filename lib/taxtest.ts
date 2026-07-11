/**
 * Czech capital-gains tax exemption helpers (§4 odst. 1 písm. w) ZDP):
 * a sale of shares is exempt from income tax if EITHER
 *   1. the "časový test" is met — held for more than 3 years, per lot (FIFO), or
 *   2. the "hodnotový limit" is met — total gross proceeds from stock sales in
 *      the calendar year stay at or under 100 000 CZK, regardless of holding period.
 *
 * Informational only — not tax advice. In particular this ignores the 2025
 * reform's extended test for very large holdings (aggregate cost basis over
 * ~40 mil. CZK), which doesn't apply to a portfolio this size.
 */

export const ANNUAL_VALUE_LIMIT_CZK = 100_000;
const TIME_TEST_YEARS = 3;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** First day the shares from a lot bought on `purchaseIso` are exempt (holding period > 3 years). */
export function exemptDateForLot(purchaseIso: string): string {
  const d = new Date(purchaseIso);
  d.setUTCFullYear(d.getUTCFullYear() + TIME_TEST_YEARS);
  d.setUTCDate(d.getUTCDate() + 1); // "exceeding" 3 years, not exactly 3 years
  return iso(d);
}

export interface HoldingTaxStatus {
  totalShares: number;
  exemptShares: number; // already past the time test
  pendingShares: number; // not yet exempt
  nextExemptDate: string | null; // date the next lot (by purchase order) becomes exempt
  nextExemptShares: number; // shares becoming exempt on nextExemptDate
}

/** Time-test status for one holding's remaining FIFO lots. */
export function holdingTaxStatus(lots: { shares: number; time: string }[], todayIso = iso(new Date())): HoldingTaxStatus {
  let totalShares = 0;
  let exemptShares = 0;
  let nextExemptDate: string | null = null;
  let nextExemptShares = 0;

  // Lots are already oldest-first (FIFO order), so the first non-exempt lot
  // encountered is the next one to become exempt.
  for (const lot of lots) {
    totalShares += lot.shares;
    const exemptDate = exemptDateForLot(lot.time);
    if (exemptDate <= todayIso) {
      exemptShares += lot.shares;
    } else if (nextExemptDate === null) {
      nextExemptDate = exemptDate;
      nextExemptShares = lot.shares;
    }
  }

  return {
    totalShares,
    exemptShares,
    pendingShares: totalShares - exemptShares,
    nextExemptDate,
    nextExemptShares,
  };
}
