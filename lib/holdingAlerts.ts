import { readJson, writeJson } from "./storage";
import { type PriceAlert } from "./priceAlert";

/**
 * Price alerts on stocks the user already OWNS (portfolio holdings), keyed by
 * Yahoo symbol — separate from the wishlist (lib/wishlist.ts), which is for
 * stocks outside the portfolio. Same alert shape/semantics (see
 * lib/priceAlert.ts): visual highlight + client-side browser Notification,
 * no background worker.
 *
 * `createHoldingAlertsStore` is a factory (not a singleton) so the public /demo
 * page can get its OWN store (see demoHoldingAlerts below) — demo holdings are
 * real tickers (AAPL, NVDA, MSFT…) that can collide with a real portfolio's
 * holdings, so demo alerts must never land in the same file as production ones.
 */

export type HoldingAlerts = Record<string, PriceAlert>; // symbol -> alert

// Caps against unbounded growth from repeated writes with novel symbols — relevant
// mainly for the public, unauthenticated /demo instance of this store (see
// app/api/demo/holding-alerts), which anyone can PATCH without rate limiting.
const MAX_SYMBOL_LEN = 20;
const MAX_ALERTS = 500;

export function createHoldingAlertsStore(cacheKey: string) {
  async function loadHoldingAlerts(): Promise<HoldingAlerts> {
    return (await readJson<HoldingAlerts>(cacheKey)) ?? {};
  }

  // Same serialized read-modify-write protection as wishlist.ts/sectionVisibility.ts —
  // without it two rapid PATCHes can each read the pre-change file and the second
  // write silently drops the first.
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function setHoldingAlert(symbol: string, alert: PriceAlert | null): Promise<HoldingAlerts> {
    return serialized(async () => {
      const alerts = await loadHoldingAlerts();
      const safeSymbol = symbol.slice(0, MAX_SYMBOL_LEN);
      if (alert) {
        if (safeSymbol in alerts || Object.keys(alerts).length < MAX_ALERTS) alerts[safeSymbol] = alert;
      } else {
        delete alerts[safeSymbol];
      }
      await writeJson(cacheKey, alerts);
      return alerts;
    });
  }

  return { loadHoldingAlerts, setHoldingAlert };
}

export const { loadHoldingAlerts, setHoldingAlert } = createHoldingAlertsStore("holdingAlerts.json");
