import { promises as fs } from "fs";
import path from "path";

/**
 * Analyst price targets and rating breakdown from stockanalysis.com's public
 * overview API (reachable without a key, unlike Yahoo quoteSummary which is
 * crumb-blocked). Covers US-listed tickers by plain symbol (AAPL, NVDA, …).
 */

const CACHE_FILE = path.join(process.cwd(), "data", "analysts.json");
const TTL_MS = 12 * 60 * 60 * 1000; // ratings move slowly

export interface AnalystBreakdown {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface AnalystData {
  symbol: string;
  rating: string; // "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell"
  targetPrice: number; // average 12-month price target (native currency)
  breakdown: AnalystBreakdown;
  count: number; // number of analysts (sum of breakdown)
}

type Cache = Record<string, { fetchedAt: number; data: AnalystData | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8")) as Cache;
  } catch {
    cache = {};
  }
  return cache;
}
async function saveCache(): Promise<void> {
  if (!cache) return;
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache), "utf8");
  } catch (e) {
    console.error("analysts cache save failed", e);
  }
}

const parseMoney = (s: unknown): number => {
  if (typeof s !== "string") return 0;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
};

export async function fetchAnalysts(symbol: string, force = false): Promise<AnalystData | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.data;

  try {
    const url = `https://stockanalysis.com/api/symbol/s/${encodeURIComponent(symbol)}/overview`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`stockanalysis HTTP ${res.status}`);
    const json: any = await res.json();
    const d = json?.data ?? {};
    const chart = d.analystChart;
    const rating = d.analysts;

    if (!chart || !rating) {
      c[symbol] = { fetchedAt: Date.now(), data: null };
      await saveCache();
      return null;
    }

    const breakdown: AnalystBreakdown = {
      strongBuy: chart.strongBuy ?? 0,
      buy: chart.buy ?? 0,
      hold: chart.hold ?? 0,
      sell: chart.sell ?? 0,
      strongSell: chart.strongSell ?? 0,
    };
    const count = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const data: AnalystData = {
      symbol,
      rating,
      targetPrice: parseMoney(d.analystTarget?.target),
      breakdown,
      count,
    };
    c[symbol] = { fetchedAt: Date.now(), data };
    await saveCache();
    return data;
  } catch (e) {
    console.error(`fetchAnalysts failed for ${symbol}`, e);
    return hit?.data ?? null;
  }
}
