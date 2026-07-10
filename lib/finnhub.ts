import { readJson, writeJson } from "./storage";

/**
 * Finnhub (free tier) — company profile (sector) and insider transactions.
 * API key read from FINNHUB_API_KEY (.env.local, gitignored). Free tier has
 * no institutional-ownership or price-target access, so those are omitted.
 */

const KEY = process.env.FINNHUB_API_KEY ?? "";
const CACHE_KEY = "finnhub.json";
const PROFILE_TTL = 7 * 24 * 60 * 60 * 1000; // sector rarely changes
const INSIDER_TTL = 12 * 60 * 60 * 1000;

export interface Profile {
  sector: string;
  marketCap: number; // in millions (Finnhub unit)
  name: string;
  country: string;
}

export interface InsiderTx {
  name: string;
  change: number; // shares (+buy / -sell)
  price: number;
  date: string; // transaction date
  code: string; // SEC transaction code (P purchase, S sale, ...)
}

type Cache = Record<string, { fetchedAt: number; value: any }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  if (!KEY) return null;
  const c = await loadCache();
  const hit = c[key];
  if (hit && Date.now() - hit.fetchedAt < ttl) return hit.value as T;
  try {
    const value = await fetcher();
    if (value != null) {
      c[key] = { fetchedAt: Date.now(), value };
      await saveCache();
    }
    return value ?? (hit?.value ?? null);
  } catch (e) {
    console.error(`finnhub ${key} failed`, e);
    return hit?.value ?? null;
  }
}

async function get(url: string): Promise<any> {
  const res = await fetch(`${url}&token=${KEY}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  return res.json();
}

export async function fetchProfile(symbol: string): Promise<Profile | null> {
  if (!symbol) return null;
  return cached<Profile>(`profile:${symbol}`, PROFILE_TTL, async () => {
    const d = await get(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}`);
    if (!d?.finnhubIndustry) return null;
    return {
      sector: d.finnhubIndustry,
      marketCap: d.marketCapitalization ?? 0,
      name: d.name ?? symbol,
      country: d.country ?? "",
    };
  });
}

// Ignore small/administrative insider trades; keep only material ones.
const MIN_INSIDER_SHARES = 1000;

export async function fetchInsiderTransactions(symbol: string, limit = 12): Promise<InsiderTx[] | null> {
  if (!symbol) return null;
  return cached<InsiderTx[]>(`insider:${symbol}`, INSIDER_TTL, async () => {
    const d = await get(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}`);
    const rows: any[] = d?.data ?? [];
    if (!rows.length) return [];
    return rows
      .filter((r) => r.transactionDate && Math.abs(r.change ?? 0) >= MIN_INSIDER_SHARES)
      .sort((a, b) => (b.transactionDate as string).localeCompare(a.transactionDate))
      .slice(0, limit)
      .map((r) => ({
        name: r.name ?? "—",
        change: r.change ?? 0,
        price: r.transactionPrice ?? 0,
        date: r.transactionDate,
        code: r.transactionCode ?? "",
      }));
  });
}
