import { readJson, writeJson } from "./storage";

/**
 * Analyst price targets and rating breakdown, scraped from stockanalysis.com's
 * stock page data (reachable without a key, unlike Yahoo quoteSummary which is
 * crumb-blocked). Covers US-listed tickers by plain symbol (AAPL, NVDA, …).
 *
 * stockanalysis.com is a SvelteKit app; its old public JSON REST endpoint
 * (`/api/symbol/s/<TICKER>/overview`) was retired. Page data is now fetched
 * via SvelteKit's `<route>/__data.json` convention, serialized in the
 * "devalue" format: a flat `data` array plus objects whose values are
 * *indices* into that same array rather than the values themselves. We only
 * need one level of dereferencing for the fields we read (see resolveShallow).
 */

const CACHE_KEY = "analysts.json";
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
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

const parseMoney = (s: unknown): number => {
  if (typeof s !== "string") return 0;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
};

/**
 * Dereference one level of a devalue-encoded object: `arr[idx]` is a plain
 * object whose values are indices into `arr` pointing at the actual leaf
 * values (strings/numbers, not further nested refs — true for the fields we
 * read here). Returns the object with values resolved, or the raw value if
 * `arr[idx]` isn't an object (e.g. a primitive rating string).
 */
function resolveShallow(arr: unknown[], idx: number): any {
  const v = arr[idx];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, childIdx] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof childIdx === "number" ? arr[childIdx] : childIdx;
    }
    return out;
  }
  return v;
}

/** Find the devalue array + field-index map holding the analyst fields, anywhere in the page data. */
function findAnalystFields(json: any): { arr: unknown[]; fieldMap: Record<string, number> } | null {
  const nodes: any[] = json?.nodes ?? [];
  for (const node of nodes) {
    if (node?.type !== "data" || !Array.isArray(node.data)) continue;
    const arr: unknown[] = node.data;
    const fieldMap = arr.find(
      (item): item is Record<string, number> =>
        !!item && typeof item === "object" && "analystChart" in item && "analysts" in item && "analystTarget" in item
    );
    if (fieldMap) return { arr, fieldMap };
  }
  return null;
}

export async function fetchAnalysts(symbol: string, force = false): Promise<AnalystData | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.data;

  try {
    const url = `https://stockanalysis.com/stocks/${symbol.toLowerCase()}/__data.json`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`stockanalysis HTTP ${res.status}`);
    const json: any = await res.json();

    const found = findAnalystFields(json);
    const rating = found ? resolveShallow(found.arr, found.fieldMap.analysts) : null;
    const targetObj = found ? resolveShallow(found.arr, found.fieldMap.analystTarget) : null;
    const chart = found ? resolveShallow(found.arr, found.fieldMap.analystChart) : null;

    if (!found || !chart || typeof rating !== "string") {
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
      targetPrice: parseMoney(targetObj?.target),
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
