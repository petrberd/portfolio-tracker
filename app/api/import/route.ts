import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { parseXtbWorkbook } from "@/lib/parseXtb";
import { parseRevolutCsv } from "@/lib/parseRevolut";
import { saveExport, type Broker } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A real XTB/Revolut export is at most a few MB even for a long trading history;
// this just bounds how much an upload can force into memory (Buffer.from below reads
// the whole file at once) — sits behind Basic Auth in production, but dev has none.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Upload a broker export via multipart form-data: field "file" (.xlsx for
 * XTB, .csv for Revolut) + optional field "broker" ("xtb" | "revolut",
 * defaults to "xtb"). Each broker's data is stored separately and merged
 * into one combined portfolio on read (see lib/store.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const broker = (String(form.get("broker") ?? "xtb") === "revolut" ? "revolut" : "xtb") as Broker;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Chybí soubor (pole 'file')." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Soubor je příliš velký (limit 20 MB)." }, { status: 413 });
    }

    const parsed =
      broker === "revolut" ? parseRevolutCsv(await file.text()) : parseXtbWorkbook(Buffer.from(await file.arrayBuffer()));

    if (!parsed.cashOps.length) {
      const label = broker === "revolut" ? "Revolut" : "XTB";
      return NextResponse.json({ error: `V souboru nebyly nalezeny žádné operace. Je to ${label} export?` }, { status: 422 });
    }
    await saveExport(parsed, file.name, broker);
    return NextResponse.json({
      ok: true,
      broker,
      accountNumber: parsed.accountNumber,
      cashOps: parsed.cashOps.length,
      closedPositions: parsed.closedPositions.length,
    });
  } catch (e: any) {
    console.error("Import failed", e);
    return NextResponse.json({ error: "Import selhal. Zkontroluj, že je soubor platný export z podporovaného brokera." }, { status: 500 });
  }
}

/**
 * Convenience GET: auto-import an XTB export sitting next to the project
 * (the parent working directory) if the user hasn't uploaded one yet.
 * Local-dev only — on Netlify the parent directory is an ephemeral build
 * folder with no export file, so this is a no-op there anyway; the guard
 * just makes that explicit instead of relying on the empty directory.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Auto-import je dostupný jen lokálně." }, { status: 404 });
  }
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
    console.error("Auto-import failed", e);
    return NextResponse.json({ error: "Auto-import selhal." }, { status: 500 });
  }
}
