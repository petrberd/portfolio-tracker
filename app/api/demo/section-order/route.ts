import { NextRequest, NextResponse } from "next/server";
import { createSectionOrderStore } from "@/lib/sectionOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Own store (data/demoSectionOrder.json), same default order as production (demo has a
// wishlist section too now) — shared across all demo visitors, but never the real
// portfolio's file. See app/api/demo/holding-alerts for the same pattern.
const demoSectionOrder = createSectionOrderStore("demoSectionOrder.json");

export async function GET() {
  return NextResponse.json({ order: await demoSectionOrder.loadSectionOrder() });
}

export async function POST(req: NextRequest) {
  const { order } = await req.json();
  if (!Array.isArray(order) || !order.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "Neplatné pořadí." }, { status: 400 });
  }
  return NextResponse.json({ order: await demoSectionOrder.saveSectionOrder(order) });
}
