import { promises as fs } from "fs";
import path from "path";

/**
 * External cash held outside XTB (savings accounts). Personal config stored in
 * `data/cash.json` (gitignored — not shared). Drives the "free cash" KPI and
 * the interest income added to the income projection.
 */

export interface CashAccount {
  name: string;
  balance: number; // CZK
  ratePct: number; // annual gross interest rate, %
}
export interface CashConfig {
  accounts: CashAccount[];
  interestTaxPct: number; // withholding tax on interest, %
}

const FILE = path.join(process.cwd(), "data", "cash.json");

export async function loadCash(): Promise<CashConfig> {
  try {
    const cfg = JSON.parse(await fs.readFile(FILE, "utf8")) as CashConfig;
    return { accounts: cfg.accounts ?? [], interestTaxPct: cfg.interestTaxPct ?? 15 };
  } catch {
    return { accounts: [], interestTaxPct: 15 };
  }
}

export const freeCashTotal = (cfg: CashConfig): number => cfg.accounts.reduce((s, a) => s + (a.balance || 0), 0);

/** Net monthly interest per account after withholding tax (CZK). */
export const monthlyNetInterest = (acc: CashAccount, taxPct: number): number =>
  (acc.balance * (acc.ratePct / 100) / 12) * (1 - taxPct / 100);
