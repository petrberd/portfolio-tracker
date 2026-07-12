import { NextRequest, NextResponse } from "next/server";
import { loadHiddenSections, setSectionHidden } from "@/lib/sectionVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ hidden: await loadHiddenSections() });
}

export async function POST(req: NextRequest) {
  const { id, hidden } = await req.json();
  if (!id || typeof id !== "string" || typeof hidden !== "boolean") {
    return NextResponse.json({ error: "Chybí id nebo hidden." }, { status: 400 });
  }
  return NextResponse.json({ hidden: await setSectionHidden(id, hidden) });
}
