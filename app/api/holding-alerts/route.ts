import { NextRequest, NextResponse } from "next/server";
import { setHoldingAlert } from "@/lib/holdingAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const { symbol, targetPrice, direction, clear } = await req.json();
  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ error: "Chybí symbol." }, { status: 400 });
  }
  if (clear) {
    await setHoldingAlert(symbol, null);
  } else {
    const price = Number(targetPrice);
    if (!Number.isFinite(price) || price <= 0 || (direction !== "above" && direction !== "below")) {
      return NextResponse.json({ error: "Neplatná cílová cena nebo směr." }, { status: 400 });
    }
    await setHoldingAlert(symbol, { targetPrice: price, direction });
  }
  return NextResponse.json({ ok: true });
}
