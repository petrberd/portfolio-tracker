import { XMLParser } from "fast-xml-parser";

/**
 * Low-level SEC EDGAR fetch helpers, shared by lib/thirteenF.ts and
 * lib/secInsiders.ts. SEC asks automated clients to identify themselves with
 * a descriptive User-Agent (see https://www.sec.gov/os/webmaster-faq#developers) —
 * a generic browser UA gets blocked with "Undeclared Automated Tool".
 */

const USER_AGENT = "PortfolioTrackerApp contact@portfoliotracker.invalid";

export const xmlParser = new XMLParser({ ignoreAttributes: true, trimValues: true });

export async function secFetchJson<T = any>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}

export async function secFetchXml(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const text = await res.text();
  return xmlParser.parse(text);
}

const pad = (cik: string | number) => String(cik).padStart(10, "0");

/** SEC's "submissions" JSON for a CIK: entity name + its recent filing history. */
export async function fetchSubmissions(cik: string): Promise<any | null> {
  return secFetchJson(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);
}

/** List of {name, xmlUrl} files in a filing's directory (via the folder's index.json). */
export async function fetchFilingIndex(cik: string, accessionNumber: string): Promise<{ name: string; url: string }[]> {
  const accNoDashes = accessionNumber.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accNoDashes}`;
  const idx = await secFetchJson<{ directory: { item: { name: string }[] } }>(`${base}/index.json`);
  const items = idx?.directory?.item ?? [];
  return items.map((it) => ({ name: it.name, url: `${base}/${it.name}` }));
}
