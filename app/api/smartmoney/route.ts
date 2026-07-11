import { NextRequest, NextResponse } from "next/server";
import { fetchAllManagerReports } from "@/lib/thirteenF";
import { fetchAllInsiderReports } from "@/lib/secInsiders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Smart money" — 13F super-investor moves + insider Form 4 trades, both from SEC EDGAR. */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const [managers, insiders] = await Promise.all([
    fetchAllManagerReports(force).catch((e) => {
      console.error("fetchAllManagerReports failed", e);
      return [];
    }),
    fetchAllInsiderReports(force).catch((e) => {
      console.error("fetchAllInsiderReports failed", e);
      return [];
    }),
  ]);
  return NextResponse.json({ available: true, managers, insiders });
}
