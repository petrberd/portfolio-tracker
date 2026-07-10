import { readJson, writeJson } from "./storage";

/**
 * Dividend schedule per symbol: payment frequency, amount per share, and the
 * next ex-dividend / pay dates. Nasdaq (real ex+pay dates, Nasdaq-listed only)
 * is preferred; Yahoo chart dividend events are the fallback for everything
 * else (ex-dates are real, pay date is estimated from the ex→pay lag).
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
  source: "nasdaq" | "yahoo";
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

async function fromNasdaq(symbol: string): Promise<DivMeta | null> {
  const res = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?assetclass=stocks`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
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

async function fromYahoo(symbol: string): Promise<DivMeta | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
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
 * Payments landing in the 12-month window that starts at the FIRST DAY of the
 * current month. Enumerated by pay-date, so a dividend that already went
 * ex-dividend but whose payment falls in the window (e.g. ex 30.6., pay 10.7.)
 * is included — as is one paid earlier this month.
 */
export function projectPayments(meta: DivMeta, months = 12): ProjectedPayment[] {
  const out: ProjectedPayment[] = [];
  const p = periodDays(meta.perYear);
  const now = new Date();
  const winStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const winEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1); // exclusive

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
