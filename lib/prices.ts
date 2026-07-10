import { readJson, writeJson } from "./storage";

/**
 * Price data straight from Yahoo's public chart JSON endpoint on query1
 * (no crumb/cookie needed, unlike query2 which rate-limits). A single call per
 * symbol yields the trading currency, the latest price, the previous close and
 * the full daily close history. Results are cached with a short TTL.
 */

const CACHE_KEY = "prices.json";
const TTL_MS = 60 * 60 * 1000; // 1h auto-refresh; the "Obnovit ceny" button forces fresh

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface Chart {
  symbol: string;
  currency: string;
  price: number; // latest price (native currency)
  prevClose: number;
  closes: DailyClose[];
}

type Cache = Record<string, { fetchedAt: number; chart: Chart }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}

async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

/** Map an XTB ticker (e.g. "MU.US") to a Yahoo Finance symbol. */
export function yahooSymbol(xtbTicker: string): string {
  const t = xtbTicker.trim();
  if (!t) return "";
  const [base, suffix] = t.split(".");
  const map: Record<string, string> = {
    US: "", // NYSE/Nasdaq -> plain symbol
    UK: ".L", // London
    DE: ".DE", // Xetra
    FR: ".PA", // Paris
    NL: ".AS", // Amsterdam
    ES: ".MC", // Madrid
    IT: ".MI", // Milan
    CH: ".SW", // Swiss
    PL: ".WA", // Warsaw
  };
  if (suffix && suffix in map) return base + map[suffix];
  return base; // best effort
}

async function fetchChartRaw(symbol: string): Promise<Chart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=max`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json: any = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta ?? {};
  const ts: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0]?.close ?? [];
  const closes: DailyClose[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = quote[i];
    if (c != null) closes.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
  }
  return {
    symbol,
    currency: meta.currency ?? "USD",
    price: meta.regularMarketPrice ?? closes[closes.length - 1]?.close ?? 0,
    prevClose: meta.chartPreviousClose ?? closes[closes.length - 2]?.close ?? 0,
    closes,
  };
}

/** Fetch (and cache) the chart for one symbol. `force` bypasses the cache. */
export async function fetchChart(symbol: string, force = false): Promise<Chart | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.chart;
  try {
    const chart = await fetchChartRaw(symbol);
    if (chart && chart.closes.length) {
      c[symbol] = { fetchedAt: Date.now(), chart };
      await saveCache();
      return chart;
    }
    return hit?.chart ?? chart;
  } catch (e) {
    console.error(`fetchChart failed for ${symbol}`, e);
    return hit?.chart ?? null;
  }
}

/**
 * Daily closes for a shorter range (e.g. "2y"), fetched fresh — `range=max`
 * returns only monthly granularity, too coarse for a detail chart.
 */
export async function fetchDailyCloses(symbol: string, range = "2y"): Promise<DailyClose[]> {
  if (!symbol) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=1d&range=${range}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0]?.close ?? [];
    const out: DailyClose[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (q[i] != null) out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: q[i] });
    }
    return out;
  } catch (e) {
    console.error(`fetchDailyCloses failed for ${symbol}`, e);
    return [];
  }
}

/** Daily closes for a symbol since `from` (ISO date). */
export async function fetchHistory(symbol: string, from: string, force = false): Promise<DailyClose[]> {
  const chart = await fetchChart(symbol, force);
  if (!chart) return [];
  const fromDay = (from || "1900-01-01").slice(0, 10);
  return chart.closes.filter((c) => c.date >= fromDay);
}

/**
 * Latest price + true day-over-day % change: the live `regularMarketPrice`
 * against the most recent *completed* daily close (yesterday's close).
 */
export async function fetchQuote(
  symbol: string,
  force = false
): Promise<{ price: number; changePercent: number; currency: string }> {
  const chart = await fetchChart(symbol, force);
  if (!chart) return { price: 0, changePercent: 0, currency: "USD" };
  const closes = chart.closes;
  const n = closes.length;
  const current = chart.price || closes[n - 1]?.close || 0;
  // Previous close = last bar strictly before the most recent bar's date.
  const lastDate = closes[n - 1]?.date ?? "";
  let prev = closes[n - 2]?.close ?? current;
  for (let i = n - 1; i >= 0; i--) {
    if (closes[i].date < lastDate) {
      prev = closes[i].close;
      break;
    }
  }
  const change = prev ? ((current - prev) / prev) * 100 : 0;
  return { price: current, changePercent: change, currency: chart.currency };
}

/** CZK per 1 unit of `currency` (e.g. USD -> ~21). */
export async function fetchFxCzk(currency: string, force = false): Promise<number> {
  if (!currency || currency === "CZK") return 1;
  const chart = await fetchChart(`${currency}CZK=X`, force);
  if (chart?.price) return chart.price;
  const fallback: Record<string, number> = { USD: 21, EUR: 25, GBP: 29, CHF: 26, PLN: 5.8 };
  return fallback[currency] ?? 21;
}
