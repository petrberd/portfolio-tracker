import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { parseXtbWorkbook } from "@/lib/parseXtb";
import { saveExport } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload an XTB .xlsx export via multipart form-data (field name: "file"). */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Chybí soubor (pole 'file')." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseXtbWorkbook(buf);
    if (!parsed.cashOps.length) {
      return NextResponse.json({ error: "V souboru nebyly nalezeny žádné operace. Je to XTB export?" }, { status: 422 });
    }
    await saveExport(parsed, file.name);
    return NextResponse.json({
      ok: true,
      accountNumber: parsed.accountNumber,
      cashOps: parsed.cashOps.length,
      closedPositions: parsed.closedPositions.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Import selhal." }, { status: 500 });
  }
}

/**
 * Convenience GET: auto-import an XTB export sitting next to the project
 * (the parent working directory) if the user hasn't uploaded one yet.
 */
export async function GET() {
  try {
    const parentDir = path.resolve(process.cwd(), "..");
    const entries = await fs.readdir(parentDir);
    const candidate = entries.find((f) => /\.xlsx$/i.test(f) && /^CZK_|xtb/i.test(f));
    if (!candidate) {
      return NextResponse.json({ error: "Ve složce nebyl nalezen XTB export." }, { status: 404 });
    }
    const buf = await fs.readFile(path.join(parentDir, candidate));
    const parsed = parseXtbWorkbook(buf);
    await saveExport(parsed, candidate);
    return NextResponse.json({
      ok: true,
      autoImported: candidate,
      cashOps: parsed.cashOps.length,
      closedPositions: parsed.closedPositions.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Auto-import selhal." }, { status: 500 });
  }
}
