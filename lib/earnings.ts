import { readJson, writeJson } from "./storage";

/**
 * Next earnings report date per ticker, from stockanalysis.com's main stock
 * page data (same devalue-format `__data.json` used in lib/analysts.ts).
 * That page's `earningsDate` field is sometimes the last *reported* date
 * rather than the next one (when the site hasn't posted a new estimate yet),
 * so a date already in the past is projected forward by the typical ~91-day
 * quarterly cadence and flagged as estimated.
 */

const CACHE_KEY = "earnings.json";
const TTL_MS = 24 * 60 * 60 * 1000;
const QUARTER_DAYS = 91;
const DAY = 86400000;

export interface EarningsDate {
  date: string; // ISO YYYY-MM-DD
  estimated: boolean; // true if projected forward from a stale reported date
}

type Cache = Record<string, { fetchedAt: number; data: EarningsDate | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Dereference one level of a devalue-encoded object (see lib/analysts.ts). */
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

async function fetchRaw(symbol: string): Promise<string | null> {
  const res = await fetch(`https://stockanalysis.com/stocks/${symbol.toLowerCase()}/__data.json`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const nodes: any[] = json?.nodes ?? [];
  for (const node of nodes) {
    if (node?.type !== "data" || !Array.isArray(node.data)) continue;
    const arr: unknown[] = node.data;
    const fieldMap = arr.find(
      (item): item is Record<string, number> => !!item && typeof item === "object" && "earningsDate" in item
    );
    if (!fieldMap) continue;
    const resolved = resolveShallow(arr, arr.indexOf(fieldMap));
    if (typeof resolved.earningsDate === "string") return resolved.earningsDate;
  }
  return null;
}

export async function fetchEarningsDate(symbol: string, force = false): Promise<EarningsDate | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.data;

  let data: EarningsDate | null = null;
  try {
    const raw = await fetchRaw(symbol);
    const parsed = raw ? new Date(raw) : null;
    if (parsed && !isNaN(parsed.getTime())) {
      const today = iso(new Date());
      let d = parsed;
      let estimated = false;
      while (iso(d) < today) {
        d = new Date(d.getTime() + QUARTER_DAYS * DAY);
        estimated = true;
      }
      data = { date: iso(d), estimated };
    }
  } catch (e) {
    console.error(`fetchEarningsDate failed for ${symbol}`, e);
    return hit?.data ?? null;
  }
  c[symbol] = { fetchedAt: Date.now(), data };
  await saveCache();
  return data;
}
