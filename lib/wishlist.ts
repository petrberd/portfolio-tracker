import { readJson, writeJson } from "./storage";
import { alertTriggered, type PriceAlert } from "./priceAlert";

/**
 * Watchlist of tickers the user doesn't (necessarily) own — add any stock by
 * name/ticker, see its live detail (same StockDetail modal as a real holding),
 * and optionally set a target-price alert. Alerts are visual-only server-side
 * (no background worker/push infra): the item just highlights once its live
 * price crosses the target, checked whenever the wishlist is loaded. The
 * client (see components/Wishlist.tsx) additionally fires a browser
 * Notification the first time an alert trips, as long as the tab stays open.
 *
 * `createWishlistStore` is a factory (not a singleton) so /demo gets its OWN
 * store (data/demoWishlist.json) — shared across all anonymous demo visitors,
 * but must never touch the real portfolio's file. Same pattern as
 * lib/holdingAlerts.ts / lib/sectionVisibility.ts / lib/sectionOrder.ts.
 */

export type WishlistAlert = PriceAlert;
export { alertTriggered };

export interface WishlistItem {
  symbol: string; // Yahoo symbol, already resolved (from searchSymbols)
  name: string;
  addedAt: string; // ISO
  alert?: WishlistAlert;
}

// Caps against unbounded growth from repeated writes with novel symbols — relevant
// mainly for the public, unauthenticated /demo instance of this store (see
// app/api/demo/wishlist), which anyone can POST to without rate limiting.
const MAX_SYMBOL_LEN = 20;
const MAX_NAME_LEN = 200;
const MAX_ITEMS = 200;

export function createWishlistStore(cacheKey: string) {
  async function loadWishlist(): Promise<WishlistItem[]> {
    return (await readJson<WishlistItem[]>(cacheKey)) ?? [];
  }

  async function saveWishlist(items: WishlistItem[]): Promise<void> {
    await writeJson(cacheKey, items);
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

  function addWishlistItem(symbol: string, name: string): Promise<WishlistItem[]> {
    return serialized(async () => {
      const items = await loadWishlist();
      const safeSymbol = symbol.slice(0, MAX_SYMBOL_LEN);
      const safeName = name.slice(0, MAX_NAME_LEN);
      if (items.length < MAX_ITEMS && !items.some((i) => i.symbol === safeSymbol)) {
        items.push({ symbol: safeSymbol, name: safeName, addedAt: new Date().toISOString() });
        await saveWishlist(items);
      }
      return items;
    });
  }

  function removeWishlistItem(symbol: string): Promise<WishlistItem[]> {
    return serialized(async () => {
      const items = (await loadWishlist()).filter((i) => i.symbol !== symbol);
      await saveWishlist(items);
      return items;
    });
  }

  function setWishlistAlert(symbol: string, alert: WishlistAlert | null): Promise<WishlistItem[]> {
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

  return { loadWishlist, addWishlistItem, removeWishlistItem, setWishlistAlert };
}

export const { loadWishlist, addWishlistItem, removeWishlistItem, setWishlistAlert } =
  createWishlistStore("wishlist.json");
