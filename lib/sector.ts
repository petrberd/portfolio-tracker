import { readJson, writeJson } from "./storage";

/**
 * Sector/industry per ticker, from stockanalysis.com's main stock page data
 * (same devalue-format `__data.json` used in lib/analysts.ts / lib/earnings.ts).
 * Needs no API key, unlike Finnhub's `stock/profile2` (which this replaces for
 * sector — Finnhub is still used for insider transactions, which stockanalysis
 * doesn't expose).
 */

const CACHE_KEY = "sector.json";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // sector rarely changes

type Cache = Record<string, { fetchedAt: number; sector: string | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

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

/** Find the devalue array + field-index map holding the profile "infoTable" (Sector/Industry/…) rows. */
function findInfoTable(json: any): { arr: unknown[]; infoTableIdx: number } | null {
  const nodes: any[] = json?.nodes ?? [];
  for (const node of nodes) {
    if (node?.type !== "data" || !Array.isArray(node.data)) continue;
    const arr: unknown[] = node.data;
    const fieldMap = arr.find(
      (item): item is Record<string, number> => !!item && typeof item === "object" && "infoTable" in item
    );
    if (fieldMap) return { arr, infoTableIdx: fieldMap.infoTable };
  }
  return null;
}

export async function fetchSector(symbol: string): Promise<string | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.sector;

  try {
    const url = `https://stockanalysis.com/stocks/${symbol.toLowerCase()}/__data.json`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`stockanalysis HTTP ${res.status}`);
    const json: any = await res.json();

    const found = findInfoTable(json);
    const rowIdxs = (found ? found.arr[found.infoTableIdx] : []) as number[];
    let sector: string | null = null;
    if (found && Array.isArray(rowIdxs)) {
      for (const ri of rowIdxs) {
        const row = resolveShallow(found.arr, ri);
        if (row?.t === "Sector" && typeof row.v === "string") {
          sector = row.v;
          break;
        }
      }
    }

    c[symbol] = { fetchedAt: Date.now(), sector };
    await saveCache();
    return sector;
  } catch (e) {
    console.error(`fetchSector failed for ${symbol}`, e);
    return hit?.sector ?? null;
  }
}
