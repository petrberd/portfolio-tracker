import { NextRequest, NextResponse } from "next/server";
import { fetchQuote } from "@/lib/prices";
import { fetchAnalysts } from "@/lib/analysts";
import { addWishlistItem, alertTriggered, loadWishlist, removeWishlistItem, setWishlistAlert } from "@/lib/wishlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function enriched(force = false) {
  const items = await loadWishlist();
  const [quotes, analysts] = await Promise.all([
    Promise.all(items.map((i) => fetchQuote(i.symbol, force))),
    Promise.all(items.map((i) => fetchAnalysts(i.symbol, force))),
  ]);
  return items.map((item, i) => {
    const q = quotes[i];
    const a = analysts[i];
    const targetPrice = a?.targetPrice ?? null;
    const upsidePct = targetPrice && q.price > 0 ? ((targetPrice - q.price) / q.price) * 100 : null;
    return {
      ...item,
      price: q.price,
      currency: q.currency,
      dayChangePercent: q.changePercent,
      triggered: alertTriggered(item.alert, q.price),
      targetPrice,
      upsidePct,
      analystCount: a?.count ?? 0,
    };
  });
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  return NextResponse.json({ items: await enriched(force) });
}

export async function POST(req: NextRequest) {
  const { symbol, name } = await req.json();
  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ error: "Chybí symbol." }, { status: 400 });
  }
  await addWishlistItem(symbol, typeof name === "string" && name ? name : symbol);
  return NextResponse.json({ items: await enriched() });
}

export async function DELETE(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Chybí symbol." }, { status: 400 });
  await removeWishlistItem(symbol);
  return NextResponse.json({ items: await enriched() });
}

export async function PATCH(req: NextRequest) {
  const { symbol, targetPrice, direction, clear } = await req.json();
  if (!symbol || typeof symbol !== "string") {
    return NextResponse.json({ error: "Chybí symbol." }, { status: 400 });
  }
  if (clear) {
    await setWishlistAlert(symbol, null);
  } else {
    const price = Number(targetPrice);
    if (!Number.isFinite(price) || price <= 0 || (direction !== "above" && direction !== "below")) {
      return NextResponse.json({ error: "Neplatná cílová cena nebo směr." }, { status: 400 });
    }
    await setWishlistAlert(symbol, { targetPrice: price, direction });
  }
  return NextResponse.json({ items: await enriched() });
}
