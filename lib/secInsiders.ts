import { readJson, writeJson } from "./storage";
import { fetchSubmissions, fetchFilingIndex, secFetchXml } from "./secEdgar";

/**
 * Recent Form 4 (insider transaction) filings for a curated list of well-known
 * company insiders — free via SEC EDGAR. Only genuine open-market buys/sells
 * (transaction codes P/S) are surfaced; tax-withholding (F), grants (A), option
 * exercises (M) etc. are excluded since they aren't a discretionary trading signal.
 */

export interface TrackedInsider {
  cik: string;
  person: string;
  company: string; // for display; the issuer itself is read from each filing
}

export const TRACKED_INSIDERS: TrackedInsider[] = [
  { cik: "1197649", person: "Jensen Huang", company: "Nvidia" },
  { cik: "1494730", person: "Elon Musk", company: "Tesla" },
  { cik: "1548760", person: "Mark Zuckerberg", company: "Meta" },
];

const TRADE_CODES = new Set(["P", "S"]);

export interface InsiderTrade {
  ticker: string;
  issuer: string;
  date: string;
  code: "P" | "S";
  shares: number;
  pricePerShare: number;
}

export interface InsiderReport {
  person: string;
  company: string;
  officerTitle: string;
  trades: InsiderTrade[]; // may be empty — no genuine open-market P/S trade in the lookback window
}

const CACHE_KEY = "insiders.json";
const TTL_MS = 12 * 60 * 60 * 1000;
const LOOKBACK_FILINGS = 8; // how many of the person's most recent Form 4s to scan for a qualifying trade

type Cache = Record<string, { fetchedAt: number; data: InsiderReport }>;
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

async function fetchForm4Trades(cik: string, accessionNumber: string): Promise<any[] | null> {
  const files = await fetchFilingIndex(cik, accessionNumber);
  const doc = files.find(
    (f) => f.name.toLowerCase().endsWith(".xml") && !f.name.toLowerCase().includes("index") && f.name.toLowerCase() !== "primary_doc.xml"
  );
  if (!doc) return null;
  const xml = await secFetchXml(doc.url);
  return xml ? [xml] : null;
}

async function fetchInsiderReport(insider: TrackedInsider): Promise<InsiderReport> {
  const empty: InsiderReport = { person: insider.person, company: insider.company, officerTitle: "", trades: [] };
  const subs = await fetchSubmissions(insider.cik);
  const recent = subs?.filings?.recent;
  if (!recent) return empty;

  const filingIdx: number[] = [];
  for (let i = 0; i < recent.form.length && filingIdx.length < LOOKBACK_FILINGS; i++) {
    if (recent.form[i] === "4") filingIdx.push(i);
  }

  const trades: InsiderTrade[] = [];
  let officerTitle = "";
  for (const i of filingIdx) {
    const docs = await fetchForm4Trades(insider.cik, recent.accessionNumber[i]);
    const xml = docs?.[0]?.ownershipDocument;
    if (!xml) continue;
    const issuerSymbol = xml.issuer?.issuerTradingSymbol ?? "";
    const issuerName = xml.issuer?.issuerName ?? "";
    if (!officerTitle) officerTitle = asArray(xml.reportingOwner)[0]?.reportingOwnerRelationship?.officerTitle ?? "";
    const txns = asArray(xml.nonDerivativeTable?.nonDerivativeTransaction);
    for (const t of txns) {
      const code = t.transactionCoding?.transactionCode;
      if (!TRADE_CODES.has(code)) continue;
      trades.push({
        ticker: issuerSymbol,
        issuer: issuerName,
        date: t.transactionDate?.value ?? "",
        code,
        shares: Number(t.transactionAmounts?.transactionShares?.value ?? 0),
        pricePerShare: Number(t.transactionAmounts?.transactionPricePerShare?.value ?? 0),
      });
    }
  }
  trades.sort((a, b) => b.date.localeCompare(a.date));
  return { person: insider.person, company: insider.company, officerTitle, trades: trades.slice(0, 5) };
}

export async function fetchAllInsiderReports(force = false): Promise<InsiderReport[]> {
  const c = await loadCache();
  const out: InsiderReport[] = [];
  for (const insider of TRACKED_INSIDERS) {
    const hit = c[insider.cik];
    if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) {
      out.push(hit.data);
      continue;
    }
    try {
      const report = await fetchInsiderReport(insider);
      c[insider.cik] = { fetchedAt: Date.now(), data: report };
      out.push(report);
    } catch (e) {
      console.error(`fetchInsiderReport failed for ${insider.person}`, e);
      out.push(hit?.data ?? { person: insider.person, company: insider.company, officerTitle: "", trades: [] });
    }
  }
  await saveCache();
  return out;
}
