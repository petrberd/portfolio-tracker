import { readJson, writeJson } from "./storage";

/**
 * Price data straight from Yahoo's public chart JSON endpoint on query1
 * (no crumb/cookie needed, unlike query2 which rate-limits). A single call per
 * symbol yields the trading currency, the latest price, the previous close and
 * the full daily close history. Results are cached with a short TTL.
 */

const CACHE_KEY = "prices.json";
const TTL_MS = 60 * 60 * 1000; // 1h auto-refresh; the "Obnovit ceny" button forces fresh
const SYMBOL_MAP_KEY = "symbolMap.json"; // raw ticker -> resolved Yahoo symbol, cached indefinitely

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

let symbolMap: Record<string, string> | null = null;
async function loadSymbolMap(): Promise<Record<string, string>> {
  if (symbolMap) return symbolMap;
  symbolMap = (await readJson<Record<string, string>>(SYMBOL_MAP_KEY)) ?? {};
  return symbolMap;
}
async function saveSymbolMap(): Promise<void> {
  if (symbolMap) await writeJson(SYMBOL_MAP_KEY, symbolMap);
}

/**
 * Resolves a bare ticker (no exchange suffix — e.g. Revolut's export, or an
 * XTB exchange not in yahooSymbol()'s allowlist) to the Yahoo symbol that
 * actually has data, via Yahoo's own search/autocomplete endpoint. Tries the
 * symbol as-is first (works for the common case — plain US tickers), and
 * only falls back to search if that returns no history. The result is cached
 * indefinitely (a ticker's exchange doesn't change), so the search only runs
 * once per symbol ever, not once per hour like the price cache.
 *
 * Verified empirically against real Revolut-held European ETFs: searching
 * "4COP" and "CEBS" returns "4COP.DE"/"CEBS.DE" as the top (most relevant)
 * match, which is also the symbol that actually has price data — general
 * enough to cover exchanges outside yahooSymbol()'s hardcoded suffix map,
 * unlike a single hardcoded fallback suffix.
 */
async function resolveSymbol(raw: string): Promise<string> {
  if (!raw) return raw;
  const map = await loadSymbolMap();
  if (map[raw]) return map[raw];

  const hasData = async (sym: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) return false;
      const json: any = await res.json();
      return !!json?.chart?.result?.[0]?.timestamp?.length;
    } catch {
      return false;
    }
  };

  if (await hasData(raw)) return raw; // works as-is — nothing to cache, this is the default path

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(raw)}&quotesCount=5&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (res.ok) {
      const json: any = await res.json();
      for (const q of json?.quotes ?? []) {
        if (q.symbol && (await hasData(q.symbol))) {
          map[raw] = q.symbol;
          await saveSymbolMap();
          return q.symbol;
        }
      }
    }
  } catch (e) {
    console.error(`resolveSymbol search failed for ${raw}`, e);
  }
  return raw; // give up — caller's own fetch will fail the same way it would have without this
}

export interface SymbolSuggestion {
  symbol: string;
  name: string;
  exchange: string;
}

/**
 * User-facing ticker/company-name search (for the wishlist "add a stock" box) —
 * same Yahoo search endpoint as resolveSymbol's fallback, but returns several
 * candidates with display names instead of silently picking the first hit.
 */
export async function searchSymbols(query: string): Promise<SymbolSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json?.quotes ?? [])
      .filter((r: any) => r.symbol && (r.quoteType === "EQUITY" || r.quoteType === "ETF"))
      .map((r: any) => ({
        symbol: r.symbol as string,
        name: (r.longname || r.shortname || r.symbol) as string,
        exchange: (r.exchDisp || r.exchange || "") as string,
      }));
  } catch (e) {
    console.error(`searchSymbols failed for "${q}"`, e);
    return [];
  }
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

/**
 * Fetch (and cache) the chart for one symbol. `force` bypasses the cache.
 * Resolves the symbol first (see resolveSymbol) so bare tickers without an
 * exchange suffix — Revolut's export, or an XTB exchange not in
 * yahooSymbol()'s allowlist — still find the right Yahoo listing.
 */
export async function fetchChart(symbol: string, force = false): Promise<Chart | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.chart;
  try {
    const resolved = await resolveSymbol(symbol);
    const chart = await fetchChartRaw(resolved).catch(() => null);
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
 * returns only monthly granularity, too coarse for a detail chart. Resolves
 * the symbol the same way fetchChart does (shared cache, so this is a no-op
 * lookup once fetchChart has already resolved it for this ticker).
 */
export async function fetchDailyCloses(symbol: string, range = "2y"): Promise<DailyClose[]> {
  if (!symbol) return [];
  try {
    const resolved = await resolveSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      resolved
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
 * against the most recent *completed* daily close (yesterday's close — or
 * Friday's, over a weekend).
 *
 * Needs genuinely daily-granularity closes: `chart.closes` (from `fetchChart`,
 * a range=max request) is only MONTHLY, so a "previous" bar found there was
 * actually last month's close. `meta.chartPreviousClose` doesn't fix this
 * either — it's also computed relative to that monthly chart, not to the
 * true previous trading day (confirmed empirically: it didn't match any real
 * daily close). So this fetches a short daily-granularity range separately.
 */
export async function fetchQuote(
  symbol: string,
  force = false
): Promise<{ price: number; changePercent: number; currency: string }> {
  const chart = await fetchChart(symbol, force);
  if (!chart) return { price: 0, changePercent: 0, currency: "USD" };
  const current = chart.price || chart.closes[chart.closes.length - 1]?.close || 0;

  const daily = await fetchDailyCloses(symbol, "5d");
  const n = daily.length;
  const lastDate = daily[n - 1]?.date ?? "";
  let prev = daily[n - 2]?.close ?? current;
  for (let i = n - 1; i >= 0; i--) {
    if (daily[i].date < lastDate) {
      prev = daily[i].close;
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
