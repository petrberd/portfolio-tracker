import { NextRequest, NextResponse } from "next/server";
import { loadSectionOrder, saveSectionOrder } from "@/lib/sectionOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ order: await loadSectionOrder() });
}

export async function POST(req: NextRequest) {
  const { order } = await req.json();
  if (!Array.isArray(order) || !order.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "Neplatné pořadí." }, { status: 400 });
  }
  return NextResponse.json({ order: await saveSectionOrder(order) });
}
