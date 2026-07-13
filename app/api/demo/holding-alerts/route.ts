import { NextRequest, NextResponse } from "next/server";
import { createHoldingAlertsStore } from "@/lib/holdingAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Separate store from the real portfolio's (data/demoHoldingAlerts.json, not
// holdingAlerts.json) — the public demo uses real tickers (AAPL, NVDA, MSFT…) that can
// collide with an actual portfolio's holdings, so demo alerts must never land in the
// same file as production ones. Shared across all demo visitors (no auth), same as the
// rest of the demo dataset.
const demoHoldingAlerts = createHoldingAlertsStore("demoHoldingAlerts.json");

export async function PATCH(req: NextRequest) {
  const { symbol, targetPrice, direction, clear } = await req.json();
  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ error: "Chybí symbol." }, { status: 400 });
  }
  if (clear) {
    await demoHoldingAlerts.setHoldingAlert(symbol, null);
  } else {
    const price = Number(targetPrice);
    if (!Number.isFinite(price) || price <= 0 || (direction !== "above" && direction !== "below")) {
      return NextResponse.json({ error: "Neplatná cílová cena nebo směr." }, { status: 400 });
    }
    await demoHoldingAlerts.setHoldingAlert(symbol, { targetPrice: price, direction });
  }
  return NextResponse.json({ ok: true });
}
