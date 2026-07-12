import type { PriceAlert } from "./priceAlert";

/**
 * Client-side browser Notification for price alerts — shared by the wishlist
 * (components/Wishlist.tsx) and portfolio holdings (app/page.tsx +
 * components/PortfolioUI.tsx). Fires the first time an alert trips, deduped
 * via localStorage (keyed `symbol:targetPrice:direction`) so a 5-min refresh
 * doesn't re-notify every cycle while the price stays past target, and fires
 * again if the alert is cleared/changed and re-triggers later.
 */

const NOTIFIED_KEY = "priceAlerts.notified";

export function loadNotified(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveNotified(s: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...s]));
  } catch {
    // ignore (private browsing / storage disabled)
  }
}

export interface AlertableItem {
  symbol: string;
  name: string;
  alert?: PriceAlert;
  triggered: boolean;
  price: number;
  currency: string;
}

const money = (v: number, ccy: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(v ?? 0);

/** `notifiedRef` is a plain `{current}` box (e.g. a React ref) so callers keep their own
 * in-memory cache across renders while sharing the same localStorage-backed dedup set. */
export function notifyPriceAlerts(items: AlertableItem[], notifiedRef: { current: Set<string> | null }): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!notifiedRef.current) notifiedRef.current = loadNotified();
  const notified = notifiedRef.current;
  const stillRelevant = new Set<string>();
  for (const item of items) {
    if (!item.alert) continue;
    const key = `${item.symbol}:${item.alert.targetPrice}:${item.alert.direction}`;
    if (item.triggered) {
      stillRelevant.add(key);
      if (!notified.has(key)) {
        notified.add(key);
        const dir = item.alert.direction === "above" ? "vzrostla nad" : "kleslo pod";
        new Notification(`${item.name} (${item.symbol})`, {
          body: `Cena ${dir} ${money(item.alert.targetPrice, item.currency)} — aktuálně ${money(item.price, item.currency)}.`,
          tag: key,
        });
      }
    }
  }
  // Drop stale keys (alert cleared/changed elsewhere) so they don't linger forever.
  for (const key of [...notified]) {
    if (!stillRelevant.has(key) && items.some((i) => key.startsWith(`${i.symbol}:`))) notified.delete(key);
  }
  saveNotified(notified);
}
