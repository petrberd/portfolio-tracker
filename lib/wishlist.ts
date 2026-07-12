import { readJson, writeJson } from "./storage";

/**
 * Watchlist of tickers the user doesn't (necessarily) own — add any stock by
 * name/ticker, see its live detail (same StockDetail modal as a real holding),
 * and optionally set a target-price alert. Alerts are visual-only (no
 * background worker/push infra): the item just highlights once its live
 * price crosses the target, checked whenever the wishlist is loaded.
 */

const CACHE_KEY = "wishlist.json";

export interface WishlistAlert {
  targetPrice: number;
  direction: "above" | "below";
}

export interface WishlistItem {
  symbol: string; // Yahoo symbol, already resolved (from searchSymbols)
  name: string;
  addedAt: string; // ISO
  alert?: WishlistAlert;
}

export async function loadWishlist(): Promise<WishlistItem[]> {
  return (await readJson<WishlistItem[]>(CACHE_KEY)) ?? [];
}

async function saveWishlist(items: WishlistItem[]): Promise<void> {
  await writeJson(CACHE_KEY, items);
}

// Every mutation does read-modify-write against the same file. Two requests
// in flight at once (e.g. adding a stock right after another, or the click
// firing twice) can otherwise both read the pre-change list and each write
// their own version — the second write wins and silently drops the first
// change. Serializing all mutations through one promise chain closes that
// race within this process (good enough locally / one Netlify function
// instance; it won't coordinate across separate concurrent instances).
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export function addWishlistItem(symbol: string, name: string): Promise<WishlistItem[]> {
  return serialized(async () => {
    const items = await loadWishlist();
    if (!items.some((i) => i.symbol === symbol)) {
      items.push({ symbol, name, addedAt: new Date().toISOString() });
      await saveWishlist(items);
    }
    return items;
  });
}

export function removeWishlistItem(symbol: string): Promise<WishlistItem[]> {
  return serialized(async () => {
    const items = (await loadWishlist()).filter((i) => i.symbol !== symbol);
    await saveWishlist(items);
    return items;
  });
}

export function setWishlistAlert(symbol: string, alert: WishlistAlert | null): Promise<WishlistItem[]> {
  return serialized(async () => {
    const items = await loadWishlist();
    const item = items.find((i) => i.symbol === symbol);
    if (item) {
      if (alert) item.alert = alert;
      else delete item.alert;
      await saveWishlist(items);
    }
    return items;
  });
}

export function alertTriggered(alert: WishlistAlert | undefined, price: number): boolean {
  if (!alert || !price) return false;
  return alert.direction === "above" ? price >= alert.targetPrice : price <= alert.targetPrice;
}
