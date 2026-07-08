import { promises as fs } from "fs";
import path from "path";
import type { ParsedExport } from "./parseXtb";

const DATA_DIR = path.join(process.cwd(), "data");
const EXPORT_FILE = path.join(DATA_DIR, "export.json");

export interface StoredExport extends ParsedExport {
  importedAt: string;
  sourceFile: string;
}

export async function saveExport(data: ParsedExport, sourceFile: string): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload: StoredExport = { ...data, importedAt: new Date().toISOString(), sourceFile };
  await fs.writeFile(EXPORT_FILE, JSON.stringify(payload), "utf8");
}

export async function loadExport(): Promise<StoredExport | null> {
  try {
    const raw = await fs.readFile(EXPORT_FILE, "utf8");
    return JSON.parse(raw) as StoredExport;
  } catch {
    return null;
  }
}
