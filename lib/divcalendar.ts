import { readJson, writeJson } from "./storage";
import { fetchWithTimeout } from "./httpFetch";

/**
 * Dividend schedule per symbol: payment frequency, amount per share, and the
 * next ex-dividend / pay dates. Preference order: Nasdaq (real ex+pay dates,
 * Nasdaq-listed only) → stockanalysis.com dividend history (real ex+pay
 * dates, covers NYSE etc. too) → Yahoo chart dividend events as the last
 * resort (ex-dates are real, pay date is a generic 14-day-lag guess).
 */

const CACHE_KEY = "divcal.json";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface DivMeta {
  perYear: number; // payments per year (4 = quarterly)
  perShare: number; // amount per payment, native currency
  anchorEx: string; // most recent known ex-date (may be in the past) — basis for projection
  nextEx: string; // next UPCOMING ex-date (rolled forward) — for display
  nextPay: string; // pay date of the next upcoming ex — for display
  lagDays: number; // ex -> pay lag
  source: "nasdaq" | "stockanalysis" | "yahoo";
  estimatedPay: boolean;
}

type Cache = Record<string, { fetchedAt: number; meta: DivMeta | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Payments/year + period in days from spacing between ex-dates. */
function detectFreq(exDatesIso: string[]): number {
  if (exDatesIso.length < 2) return 4; // assume quarterly
  const ts = exDatesIso.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / DAY);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median < 45) return 12;
  if (median < 135) return 4;
  if (median < 270) return 2;
  return 1;
}
const periodDays = (perYear: number) => Math.round(365 / perYear);

function rollForward(fromIso: string, perYear: number): string {
  const p = periodDays(perYear);
  let d = new Date(fromIso).getTime();
  const now = Date.now();
  while (d < now) d += p * DAY;
  return iso(new Date(d));
}

const parseMDY = (s?: string): string => {
  if (!s || !/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return "";
  const [m, d, y] = s.split("/");
  return `${y}-${m}-${d}`;
};
const parseMoney = (s: unknown) => {
  const n = typeof s === "string" ? parseFloat(s.replace(/[^0-9.]/g, "")) : NaN;
  return isNaN(n) ? 0 : n;
};

// Shorter than fetchWithTimeout's 8s default: fetchDividendMeta below tries up to 3 of these
// sources one after another (Nasdaq -> stockanalysis.com -> Yahoo) when earlier ones don't
// have the ticker, so the default would let one symbol's worst case reach 24s — on top of
// the stock-detail route's other parallel fetches, that's what pushed a request over
// Netlify's own function timeout (real incident, 2026-07-14).
const DIV_SOURCE_TIMEOUT_MS = 5000;

async function fromNasdaq(symbol: string): Promise<DivMeta | null> {
  const res = await fetchWithTimeout(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?assetclass=stocks`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    DIV_SOURCE_TIMEOUT_MS
  );
  if (!res.ok) return null;
  const json: any = await res.json();
  const d = json?.data;
  const rows: any[] = d?.dividends?.rows ?? [];
  if (!d || !rows.length) return null;
  const exDates = rows.map((r) => parseMDY(r.exOrEffDate)).filter(Boolean);
  const perYear = detectFreq(exDates);
  const perShare = parseMoney(rows[0]?.amount);
  if (!perShare) return null;
  // ex->pay lag from the announced pair (before any roll-forward).
  const annEx = parseMDY(d.exDividendDate);
  const annPay = parseMDY(d.dividendPaymentDate);
  const lagDays =
    annEx && annPay ? Math.max(0, Math.round((new Date(annPay).getTime() - new Date(annEx).getTime()) / DAY)) : 10;
  // Anchor = most recent known ex (may be in the past, e.g. ex passed but not yet paid).
  const anchorEx = annEx || exDates[0] || iso(new Date());
  // Next upcoming ex (for display): roll the anchor forward past today.
  const nextEx = rollForward(anchorEx, perYear);
  const nextPay = iso(new Date(new Date(nextEx).getTime() + lagDays * DAY));
  return { perYear, perShare, anchorEx, nextEx, nextPay, lagDays, source: "nasdaq", estimatedPay: false };
}

/**
 * Dereference one level of a devalue-encoded object (same format as
 * lib/analysts.ts): `arr[idx]` is a plain object whose values are indices
 * into `arr` pointing at the actual leaf values.
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

/**
 * Real ex-dividend + pay date history from stockanalysis.com's dividend page
 * (`/stocks/<ticker>/dividend/__data.json`, SvelteKit "devalue" format — see
 * lib/analysts.ts for the format notes). Covers NYSE etc., unlike the Nasdaq
 * API which only returns data for Nasdaq-listed tickers.
 */
async function fromStockAnalysis(symbol: string): Promise<DivMeta | null> {
  const res = await fetchWithTimeout(
    `https://stockanalysis.com/stocks/${encodeURIComponent(symbol.toLowerCase())}/dividend/__data.json`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
    DIV_SOURCE_TIMEOUT_MS
  );
  if (!res.ok) return null;
  const json: any = await res.json();
  const nodes: any[] = json?.nodes ?? [];
  let rows: { dt: string; amt: string; pay: string }[] = [];
  for (const node of nodes) {
    if (node?.type !== "data" || !Array.isArray(node.data)) continue;
    const arr: unknown[] = node.data;
    const fieldMap = arr.find(
      (item): item is Record<string, number> => !!item && typeof item === "object" && "history" in item && "infoTable" in item
    );
    if (!fieldMap) continue;
    const rowIdxs = arr[fieldMap.history] as number[];
    if (!Array.isArray(rowIdxs)) continue;
    rows = rowIdxs.map((i) => resolveShallow(arr, i)).filter((r) => r?.dt && /^\d{4}-\d{2}-\d{2}$/.test(r.dt));
    break;
  }
  if (!rows.length) return null;

  // Rows come most-recent-first.
  const exDates = rows.map((r) => r.dt);
  const perYear = detectFreq(exDates);
  const perShare = parseMoney(rows[0].amt);
  if (!perShare) return null;
  const anchorEx = rows[0].dt;
  // Real lag from the most recent row that actually has a pay date (the very
  // latest dividend may still show "n/a" if unpaid as of the scrape).
  const withPay = rows.find((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.pay));
  const lagDays = withPay
    ? Math.max(0, Math.round((new Date(withPay.pay).getTime() - new Date(withPay.dt).getTime()) / DAY))
    : 14;
  const nextEx = rollForward(anchorEx, perYear);
  const nextPay = iso(new Date(new Date(nextEx).getTime() + lagDays * DAY));
  return { perYear, perShare, anchorEx, nextEx, nextPay, lagDays, source: "stockanalysis", estimatedPay: true };
}

async function fromYahoo(symbol: string): Promise<DivMeta | null> {
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
    DIV_SOURCE_TIMEOUT_MS
  );
  if (!res.ok) return null;
  const json: any = await res.json();
  const ev = json?.chart?.result?.[0]?.events?.dividends ?? {};
  const list = Object.values(ev) as any[];
  if (!list.length) return null;
  list.sort((a, b) => a.date - b.date);
  const exDates = list.map((x) => iso(new Date(x.date * 1000)));
  const perYear = detectFreq(exDates);
  const perShare = list[list.length - 1].amount ?? 0;
  if (!perShare) return null;
  const anchorEx = exDates[exDates.length - 1]; // most recent real ex-date
  const nextEx = rollForward(anchorEx, perYear);
  const lagDays = 14; // typical ex->pay lag when unknown
  const nextPay = iso(new Date(new Date(nextEx).getTime() + lagDays * DAY));
  return { perYear, perShare, anchorEx, nextEx, nextPay, lagDays, source: "yahoo", estimatedPay: true };
}

export async function fetchDividendMeta(symbol: string, force = false): Promise<DivMeta | null> {
  if (!symbol) return null;
  const c = await loadCache();
  const hit = c[symbol];
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.meta;
  let meta: DivMeta | null = null;
  try {
    meta = await fromNasdaq(symbol).catch(() => null);
    if (!meta) meta = await fromStockAnalysis(symbol).catch(() => null);
    if (!meta) meta = await fromYahoo(symbol).catch(() => null);
  } catch (e) {
    console.error(`fetchDividendMeta failed for ${symbol}`, e);
    return hit?.meta ?? null;
  }
  c[symbol] = { fetchedAt: Date.now(), meta };
  await saveCache();
  return meta;
}

export interface ProjectedPayment {
  exDate: string;
  payDate: string;
  perShare: number;
  estimatedPay: boolean;
}

/**
 * Payments landing in [windowStartIso, windowEndIso) (end exclusive), enumerated
 * by pay-date — so a dividend that already went ex-dividend but whose payment
 * falls in the window (e.g. ex 30.6., pay 10.7.) is included. The window is
 * passed in by the caller so it always matches the caller's own month bucketing
 * (previously this recomputed its own "current month" window internally, which
 * silently drifted out of sync with the API route's window and truncated the
 * last month's payments).
 */
export function projectPayments(meta: DivMeta, windowStartIso: string, windowEndIso: string): ProjectedPayment[] {
  const out: ProjectedPayment[] = [];
  const p = periodDays(meta.perYear);
  const winStart = new Date(windowStartIso).getTime();
  const winEnd = new Date(windowEndIso).getTime(); // exclusive

  // Position ex so the first payment lands at/after the window start.
  let ex = new Date(meta.anchorEx).getTime();
  const period = p * DAY;
  while (ex + meta.lagDays * DAY < winStart) ex += period; // move up if anchor is old
  while (ex + meta.lagDays * DAY >= winStart) ex -= period; // step back below window
  ex += period; // first payment at/after window start

  for (let i = 0; i < 40; i++, ex += period) {
    const pay = ex + meta.lagDays * DAY;
    if (pay >= winEnd) break;
    out.push({
      exDate: iso(new Date(ex)),
      payDate: iso(new Date(pay)),
      perShare: meta.perShare,
      estimatedPay: meta.estimatedPay,
    });
  }
  return out;
}
