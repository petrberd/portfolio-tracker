import { fetchWithTimeout } from "./httpFetch";

/**
 * Per-stock news headlines from Yahoo Finance's public RSS feed (reachable
 * without a key). Returns the most recent items for a ticker.
 */

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string; // ISO
}

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
};

export async function fetchNews(symbol: string, limit = 12): Promise<NewsItem[]> {
  if (!symbol) return [];
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Yahoo RSS HTTP ${res.status}`);
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    return items.slice(0, limit).map((block) => {
      const pub = tag(block, "pubDate");
      const d = pub ? new Date(pub) : null;
      return {
        title: tag(block, "title"),
        link: tag(block, "link"),
        source: tag(block, "source") || "Yahoo Finance",
        publishedAt: d && !isNaN(d.getTime()) ? d.toISOString() : "",
      };
    });
  } catch (e) {
    console.error(`fetchNews failed for ${symbol}`, e);
    return [];
  }
}
