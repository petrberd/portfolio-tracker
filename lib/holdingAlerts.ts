import { readJson, writeJson } from "./storage";
import { type PriceAlert } from "./priceAlert";

/**
 * Price alerts on stocks the user already OWNS (portfolio holdings), keyed by
 * Yahoo symbol — separate from the wishlist (lib/wishlist.ts), which is for
 * stocks outside the portfolio. Same alert shape/semantics (see
 * lib/priceAlert.ts): visual highlight + client-side browser Notification,
 * no background worker.
 */

const CACHE_KEY = "holdingAlerts.json";

export type HoldingAlerts = Record<string, PriceAlert>; // symbol -> alert

export async function loadHoldingAlerts(): Promise<HoldingAlerts> {
  return (await readJson<HoldingAlerts>(CACHE_KEY)) ?? {};
}

async function saveHoldingAlerts(alerts: HoldingAlerts): Promise<void> {
  await writeJson(CACHE_KEY, alerts);
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

export function setHoldingAlert(symbol: string, alert: PriceAlert | null): Promise<HoldingAlerts> {
  return serialized(async () => {
    const alerts = await loadHoldingAlerts();
    if (alert) alerts[symbol] = alert;
    else delete alerts[symbol];
    await saveHoldingAlerts(alerts);
    return alerts;
  });
}
