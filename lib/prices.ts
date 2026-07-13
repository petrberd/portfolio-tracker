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

/** When the cached price for `symbol` was last actually fetched (ms epoch), or null if
 * never cached. Used to show how fresh the displayed prices really are — distinct from
 * "when was the portfolio last imported" (that's a separate, much rarer event). */
export async function priceFetchedAt(symbol: string): Promise<number | null> {
  const c = await loadCache();
  return c[symbol]?.fetchedAt ?? null;
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

/** Yahoo chart `range` string -> cutoff ISO date (YYYY-MM-DD) that far back from today.
 * Used by the stock detail routes to filter the chart-cache fallback and the buy/sell
 * trade markers to the same window as the (separately fetched) daily-close range, so a
 * "1 měsíc" chart doesn't show trade dots from three years ago. */
export function rangeCutoffDate(range: string): string {
  const cutoff = new Date();
  switch (range) {
    case "1mo":
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
      break;
    case "3mo":
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
      break;
    case "5y":
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
      break;
    case "1y":
    default:
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
      break;
  }
  return cutoff.toISOString().slice(0, 10);
}

/** Yahoo chart `range` -> the finest `interval` Yahoo allows for it (used by the stock
 * detail routes so 1mo/3mo charts get real intraday movement — see fetchDailyCloses'
 * doc for why). Yahoo's own interval/range ceilings: 15m data only goes back ~60 days,
 * 60m goes back ~730 days — so 1mo can use 15m but 3mo needs to step down to 60m.
 * 1y/5y stay daily; hourly candles over a year would be a lot of data for no visible
 * benefit (the day-to-day price swing dwarfs any intraday-vs-close gap at that zoom). */
export function rangeIntradayInterval(range: string): string {
  switch (range) {
    case "1mo":
      return "15m";
    case "3mo":
      return "60m";
    default:
      return "1d";
  }
}

/**
 * Closes for a shorter range (e.g. "2y"), fetched fresh — `range=max` returns
 * only monthly granularity, too coarse for a detail chart. Resolves the
 * symbol the same way fetchChart does (shared cache, so this is a no-op
 * lookup once fetchChart has already resolved it for this ticker).
 *
 * `interval` defaults to daily ("1d"), in which case `date` is truncated to
 * YYYY-MM-DD (one point per day, matching every other daily-close consumer).
 * Passing an intraday interval (e.g. "15m"/"60m" — see rangeIntradayInterval)
 * keeps the full timestamp instead, so a short-range detail chart can show
 * genuine intraday movement rather than one flat point per day; that in turn
 * lets a buy/sell marker at its exact execution time land close to the line
 * instead of being compared against the day's *closing* price, which is what
 * made trade dots look "off" on the 1mo/3mo stock-detail chart (reported by
 * Petr 2026-07-13 — visible there because the price swings shown are small
 * enough that an intraday vs. close difference stands out; invisible on
 * 1y/5y where the y-axis spans a much wider range).
 */
export async function fetchDailyCloses(symbol: string, range = "2y", interval = "1d"): Promise<DailyClose[]> {
  if (!symbol) return [];
  try {
    const resolved = await resolveSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      resolved
    )}?interval=${interval}&range=${range}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0]?.close ?? [];
    const out: DailyClose[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (q[i] != null) {
        const iso = new Date(ts[i] * 1000).toISOString();
        out.push({ date: interval === "1d" ? iso.slice(0, 10) : iso, close: q[i] });
      }
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
 * Friday's, over a weekend/holiday — see `prevCloseIsYesterday` below).
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
): Promise<{
  price: number;
  changePercent: number;
  currency: string;
  /** ISO date (YYYY-MM-DD) of the close `changePercent` is measured against. */
  prevCloseDate: string;
  /** False when the gap to `prevCloseDate` is more than 1 calendar day — a
   * weekend or holiday, so callers displaying e.g. "vs. yesterday's close"
   * (see MarketMood.tsx) know to say which day it actually was instead. */
  prevCloseIsYesterday: boolean;
}> {
  const chart = await fetchChart(symbol, force);
  if (!chart) return { price: 0, changePercent: 0, currency: "USD", prevCloseDate: "", prevCloseIsYesterday: true };
  const current = chart.price || chart.closes[chart.closes.length - 1]?.close || 0;

  const daily = await fetchDailyCloses(symbol, "5d");
  const n = daily.length;
  const lastDate = daily[n - 1]?.date ?? "";
  let prev = daily[n - 2]?.close ?? current;
  let prevDate = daily[n - 2]?.date ?? "";
  for (let i = n - 1; i >= 0; i--) {
    if (daily[i].date < lastDate) {
      prev = daily[i].close;
      prevDate = daily[i].date;
      break;
    }
  }
  const change = prev ? ((current - prev) / prev) * 100 : 0;
  const gapDays = lastDate && prevDate ? Math.round((new Date(lastDate).getTime() - new Date(prevDate).getTime()) / 86400000) : 1;
  return { price: current, changePercent: change, currency: chart.currency, prevCloseDate: prevDate, prevCloseIsYesterday: gapDays <= 1 };
}

/** CZK per 1 unit of `currency` (e.g. USD -> ~21). */
export async function fetchFxCzk(currency: string, force = false): Promise<number> {
  if (!currency || currency === "CZK") return 1;
  const chart = await fetchChart(`${currency}CZK=X`, force);
  if (chart?.price) return chart.price;
  const fallback: Record<string, number> = { USD: 21, EUR: 25, GBP: 29, CHF: 26, PLN: 5.8 };
  return fallback[currency] ?? 21;
}
