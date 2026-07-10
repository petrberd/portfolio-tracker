import { readJson, writeJson } from "./storage";

/**
 * Company fundamentals from Yahoo's public `fundamentals-timeseries` endpoint
 * (works on query1 without a crumb, unlike quoteSummary). Used for the compact
 * metrics strip in the stock detail view.
 */

const CACHE_KEY = "fundamentals.json";
const TTL_MS = 24 * 60 * 60 * 1000;

const TYPES = [
  "annualDilutedEPS",
  "annualTotalRevenue",
  "annualFreeCashFlow",
  "annualNormalizedEBITDA",
  "annualOrdinarySharesNumber",
  "annualNetIncome",
];

export interface Fundamentals {
  symbol: string;
  eps: number;
  revenue: number;
  fcf: number;
  ebitda: number;
  shares: number;
  netIncome: number;
  revenueGrowth: number; // CAGR
  asOf: string;
}

type Cache = Record<string, { fetchedAt: number; fund: Fundamentals | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

function cagr(series: number[]): number {
  const vals = series.filter((v) => typeof v === "number" && isFinite(v));
  if (vals.length < 2) return 0;
  const first = vals[0];
  const last = vals[vals.length - 1];
  if (first <= 0 || last <= 0) return 0;
  return Math.pow(last / first, 1 / (vals.length - 1)) - 1;
}

export async function fetchFundamentals(symbol: string, force = false): Promise<Fundamentals | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.fund;

  try {
    const url =
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
      `?symbol=${encodeURIComponent(symbol)}&type=${TYPES.join(",")}&period1=1420070400&period2=1893456000`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Yahoo fundamentals HTTP ${res.status}`);
    const json: any = await res.json();
    const results: any[] = json?.timeseries?.result ?? [];

    const byType = new Map<string, number[]>();
    let asOf = "";
    for (const r of results) {
      const type = r?.meta?.type?.[0];
      const arr = r?.[type];
      if (!type || !Array.isArray(arr)) continue;
      const pts = arr.filter((x: any) => x && x.reportedValue);
      byType.set(type, pts.map((x: any) => x.reportedValue.raw as number));
      if (type === "annualDilutedEPS" && pts.length) asOf = pts[pts.length - 1].asOfDate;
    }
    const latest = (t: string) => {
      const s = byType.get(t);
      return s && s.length ? s[s.length - 1] : NaN;
    };

    const revenue = latest("annualTotalRevenue");
    const eps = latest("annualDilutedEPS");
    if (!isFinite(revenue) && !isFinite(eps)) {
      c[symbol] = { fetchedAt: Date.now(), fund: null };
      await saveCache();
      return null;
    }

    const fund: Fundamentals = {
      symbol,
      eps: eps || 0,
      revenue: revenue || 0,
      fcf: latest("annualFreeCashFlow") || 0,
      ebitda: latest("annualNormalizedEBITDA") || 0,
      shares: latest("annualOrdinarySharesNumber") || 0,
      netIncome: latest("annualNetIncome") || 0,
      revenueGrowth: cagr(byType.get("annualTotalRevenue") ?? []),
      asOf,
    };
    c[symbol] = { fetchedAt: Date.now(), fund };
    await saveCache();
    return fund;
  } catch (e) {
    console.error(`fetchFundamentals failed for ${symbol}`, e);
    return hit?.fund ?? null;
  }
}
