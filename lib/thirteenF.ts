import { readJson, writeJson } from "./storage";
import { fetchSubmissions, fetchFilingIndex, secFetchXml } from "./secEdgar";

/**
 * 13F-HR quarterly holdings snapshots for a curated list of well-known fund
 * managers, diffed quarter-over-quarter to show buys/sells — inspired by
 * Alocano's "Smart Money" panel. Free via SEC EDGAR, but with real limits:
 *   - 13F only reports a POINT-IN-TIME snapshot, not transactions, so "bought"/
 *     "sold" here means "position size changed between two quarterly filings."
 *   - Filings are due 45 days after quarter-end, so this is always ~1.5-4.5
 *     months stale — never "what they're doing today."
 *   - No free, reliable CUSIP -> ticker mapping exists, so positions are
 *     shown by company name (from the filing) rather than ticker symbol.
 */

export interface TrackedManager {
  cik: string;
  person: string; // public-facing name, e.g. "Warren Buffett"
  fund: string; // filing entity, e.g. "Berkshire Hathaway"
}

export const TRACKED_MANAGERS: TrackedManager[] = [
  { cik: "1067983", person: "Warren Buffett", fund: "Berkshire Hathaway" },
  { cik: "1336528", person: "Bill Ackman", fund: "Pershing Square Capital Management" },
  { cik: "1649339", person: "Michael Burry", fund: "Scion Asset Management" },
];

interface Holding {
  cusip: string;
  name: string;
  shares: number;
  value: number; // USD, thousands (as reported)
}

export interface HoldingMove {
  name: string;
  kind: "new" | "increased" | "decreased" | "closed";
  shares: number; // current shares (0 if closed)
  sharesDelta: number; // signed change vs. previous quarter
  value: number; // current value, USD thousands (0 if closed)
}

export interface ManagerReport {
  person: string;
  fund: string;
  periodOfReport: string; // quarter-end date the latest filing covers
  filedAt: string;
  moves: HoldingMove[]; // top moves, largest |value change| first
}

const CACHE_KEY = "13f.json";
const TTL_MS = 24 * 60 * 60 * 1000;

type Cache = Record<string, { fetchedAt: number; data: ManagerReport | null }>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  cache = (await readJson<Cache>(CACHE_KEY)) ?? {};
  return cache;
}
async function saveCache(): Promise<void> {
  if (cache) await writeJson(CACHE_KEY, cache);
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Parse + group-by-CUSIP one 13F info table XML into per-issuer holdings. */
async function fetchHoldings(url: string): Promise<Map<string, Holding>> {
  const xml = await secFetchXml(url);
  const rows = asArray<any>(xml?.informationTable?.infoTable);
  const byCusip = new Map<string, Holding>();
  for (const row of rows) {
    const cusip = String(row.cusip ?? "");
    if (!cusip) continue;
    const shares = Number(row.shrsOrPrnAmt?.sshPrnamt ?? 0);
    const value = Number(row.value ?? 0);
    const existing = byCusip.get(cusip);
    if (existing) {
      existing.shares += shares;
      existing.value += value;
    } else {
      byCusip.set(cusip, { cusip, name: String(row.nameOfIssuer ?? cusip), shares, value });
    }
  }
  return byCusip;
}

/** Find the actual info-table XML in a 13F filing's directory (not primary_doc.xml, not an index page). */
async function findInfoTableUrl(cik: string, accessionNumber: string): Promise<string | null> {
  const files = await fetchFilingIndex(cik, accessionNumber);
  const candidate = files.find(
    (f) => f.name.toLowerCase().endsWith(".xml") && f.name.toLowerCase() !== "primary_doc.xml" && !f.name.toLowerCase().includes("index")
  );
  return candidate?.url ?? null;
}

async function fetchManagerReport(m: TrackedManager): Promise<ManagerReport | null> {
  const subs = await fetchSubmissions(m.cik);
  if (!subs) return null;
  const recent = subs.filings?.recent;
  if (!recent) return null;

  const filingIdx: number[] = [];
  for (let i = 0; i < recent.form.length && filingIdx.length < 2; i++) {
    if (recent.form[i] === "13F-HR") filingIdx.push(i);
  }
  if (filingIdx.length < 1) return null;

  const [latestUrl, prevUrl] = await Promise.all(
    filingIdx.map((i) => findInfoTableUrl(m.cik, recent.accessionNumber[i]))
  );
  if (!latestUrl) return null;

  const [latest, prev] = await Promise.all([fetchHoldings(latestUrl), prevUrl ? fetchHoldings(prevUrl) : new Map()]);

  const moves: HoldingMove[] = [];
  for (const [cusip, h] of latest) {
    const before = prev.get(cusip);
    const sharesDelta = h.shares - (before?.shares ?? 0);
    if (!before) moves.push({ name: h.name, kind: "new", shares: h.shares, sharesDelta, value: h.value });
    else if (sharesDelta > 0) moves.push({ name: h.name, kind: "increased", shares: h.shares, sharesDelta, value: h.value });
    else if (sharesDelta < 0) moves.push({ name: h.name, kind: "decreased", shares: h.shares, sharesDelta, value: h.value });
  }
  for (const [cusip, h] of prev) {
    if (!latest.has(cusip)) moves.push({ name: h.name, kind: "closed", shares: 0, sharesDelta: -h.shares, value: 0 });
  }
  moves.sort((a, b) => Math.abs(b.sharesDelta * (b.value || 1)) - Math.abs(a.sharesDelta * (a.value || 1)));

  return {
    person: m.person,
    fund: m.fund,
    periodOfReport: recent.reportDate?.[filingIdx[0]] ?? "",
    filedAt: recent.filingDate[filingIdx[0]],
    moves: moves.slice(0, 6),
  };
}

export async function fetchAllManagerReports(force = false): Promise<ManagerReport[]> {
  const c = await loadCache();
  const out: ManagerReport[] = [];
  for (const m of TRACKED_MANAGERS) {
    const hit = c[m.cik];
    if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) {
      if (hit.data) out.push(hit.data);
      continue;
    }
    try {
      const report = await fetchManagerReport(m);
      c[m.cik] = { fetchedAt: Date.now(), data: report };
      if (report) out.push(report);
    } catch (e) {
      console.error(`fetchManagerReport failed for ${m.fund}`, e);
      if (hit?.data) out.push(hit.data);
    }
  }
  await saveCache();
  return out;
}
