import { readJson, writeJson } from "./storage";
import { fetchWithTimeout } from "./httpFetch";

/**
 * Insider transactions per ticker, from Nasdaq's public company API — same
 * domain/pattern as the dividend calendar's `fromNasdaq()` in divcalendar.ts,
 * but unlike that endpoint (Nasdaq-listed only), this one also returns data
 * for NYSE tickers (verified against VICI, JNJ). No API key needed, unlike
 * the Finnhub `insider-transactions` endpoint this replaces.
 */

const CACHE_KEY = "insider.json";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface InsiderTx {
  name: string;
  change: number; // shares (+buy / -sell)
  price: number;
  date: string; // transaction date, ISO YYYY-MM-DD
  code: string; // Nasdaq's own transaction-type label (not a SEC code)
}

type Cache = Record<string, { fetchedAt: number; data: InsiderTx[] | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

// Ignore small/administrative trades; keep only material ones.
const MIN_SHARES = 1000;

// Nasdaq's transactionType is a free-text label, not a signed SEC code — bucket the
// common ones into buy/sell and drop the rest (option exercises, gifts, …) as
// ambiguous rather than guess a direction.
const BUY_TYPES = new Set(["Buy", "Acquisition (Non Open Market)"]);
const SELL_TYPES = new Set(["Sell", "Automatic Sell", "Disposition (Non Open Market)"]);

const parseShares = (s: unknown) => {
  const n = typeof s === "string" ? parseFloat(s.replace(/[^0-9.]/g, "")) : NaN;
  return isNaN(n) ? 0 : n;
};
const parseMoney = parseShares;

/** "M/D/YYYY" (Nasdaq's format, zero-padding inconsistent) -> "YYYY-MM-DD". */
function parseMDY(s: unknown): string {
  if (typeof s !== "string") return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export async function fetchInsiderTransactions(symbol: string, limit = 12): Promise<InsiderTx[] | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.data;

  try {
    const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/insider-trades?limit=100&type=ALL`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    if (!res.ok) throw new Error(`Nasdaq HTTP ${res.status}`);
    const json: any = await res.json();
    const rows: any[] = json?.data?.transactionTable?.table?.rows ?? [];

    const data: InsiderTx[] = rows
      .map((r) => {
        const type = r.transactionType as string;
        const sign = BUY_TYPES.has(type) ? 1 : SELL_TYPES.has(type) ? -1 : 0;
        return {
          name: r.insider ?? "—",
          change: sign * parseShares(r.sharesTraded),
          price: parseMoney(r.lastPrice),
          date: parseMDY(r.lastDate),
          code: type ?? "",
          sign,
        };
      })
      .filter((r) => r.sign !== 0 && r.date && Math.abs(r.change) >= MIN_SHARES)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map(({ sign, ...tx }) => tx);

    c[symbol] = { fetchedAt: Date.now(), data };
    await saveCache();
    return data;
  } catch (e) {
    console.error(`fetchInsiderTransactions failed for ${symbol}`, e);
    return hit?.data ?? null;
  }
}
