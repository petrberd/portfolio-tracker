import type { ParsedExport } from "./parseXtb";
import { readJson, writeJson } from "./storage";

const EXPORT_KEY = "export.json";

export interface StoredExport extends ParsedExport {
  importedAt: string;
  sourceFile: string;
}

export async function saveExport(data: ParsedExport, sourceFile: string): Promise<void> {
  const payload: StoredExport = { ...data, importedAt: new Date().toISOString(), sourceFile };
  await writeJson(EXPORT_KEY, payload);
}

export async function loadExport(): Promise<StoredExport | null> {
  return readJson<StoredExport>(EXPORT_KEY);
}
