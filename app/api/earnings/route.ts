import { NextRequest, NextResponse } from "next/server";
import { loadExport } from "@/lib/store";
import { reconstructPortfolio } from "@/lib/positions";
import { fetchEarningsDate } from "@/lib/earnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upcoming earnings report date per current holding. */
export async function GET(req: NextRequest) {
  const stored = await loadExport();
  if (!stored) return NextResponse.json({ available: false });
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  const { holdings } = reconstructPortfolio(stored);

  const rows = await Promise.all(
    holdings.map(async (h) => {
      const e = await fetchEarningsDate(h.symbol, force);
      return e ? { ticker: h.ticker, instrument: h.instrument, date: e.date, estimated: e.estimated } : null;
    })
  );

  const events = rows.filter((r): r is NonNullable<typeof r> => r != null).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ available: true, events });
}
