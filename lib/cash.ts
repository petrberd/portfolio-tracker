import { readJson } from "./storage";

/**
 * External cash held outside XTB (savings accounts). Config from `data/cash.json`
 * locally (gitignored — not shared) or the CASH_CONFIG_JSON env var (handy on
 * Netlify, where there is no local file). Drives the "free cash" KPI and the
 * interest income added to the income projection.
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

const normalize = (cfg: Partial<CashConfig> | null): CashConfig => ({
  accounts: cfg?.accounts ?? [],
  interestTaxPct: cfg?.interestTaxPct ?? 15,
});

export async function loadCash(): Promise<CashConfig> {
  if (process.env.CASH_CONFIG_JSON) {
    try {
      return normalize(JSON.parse(process.env.CASH_CONFIG_JSON) as CashConfig);
    } catch (e) {
      console.error("CASH_CONFIG_JSON parse failed", e);
    }
  }
  return normalize(await readJson<CashConfig>("cash.json"));
}

export const freeCashTotal = (cfg: CashConfig): number => cfg.accounts.reduce((s, a) => s + (a.balance || 0), 0);

/** Net monthly interest per account after withholding tax (CZK). */
export const monthlyNetInterest = (acc: CashAccount, taxPct: number): number =>
  (acc.balance * (acc.ratePct / 100) / 12) * (1 - taxPct / 100);
