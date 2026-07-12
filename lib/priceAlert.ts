/** Shared alert shape/logic used by both the wishlist and portfolio holdings. */

export interface PriceAlert {
  targetPrice: number;
  direction: "above" | "below";
}

export function alertTriggered(alert: PriceAlert | undefined, price: number): boolean {
  if (!alert || !price) return false;
  return alert.direction === "above" ? price >= alert.targetPrice : price <= alert.targetPrice;
}
