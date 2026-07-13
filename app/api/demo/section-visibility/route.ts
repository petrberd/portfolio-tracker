import { NextRequest, NextResponse } from "next/server";
import { createSectionVisibilityStore } from "@/lib/sectionVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Own store (data/demoSectionVisibility.json) — shared across all demo visitors, but
// never the real portfolio's file. See app/api/demo/holding-alerts for the same pattern.
const demoSectionVisibility = createSectionVisibilityStore("demoSectionVisibility.json");

export async function GET() {
  return NextResponse.json({ hidden: await demoSectionVisibility.loadHiddenSections() });
}

export async function POST(req: NextRequest) {
  const { id, hidden } = await req.json();
  if (!id || typeof id !== "string" || typeof hidden !== "boolean") {
    return NextResponse.json({ error: "Chybí id nebo hidden." }, { status: 400 });
  }
  return NextResponse.json({ hidden: await demoSectionVisibility.setSectionHidden(id, hidden) });
}
