import type { ParsedExport } from "./parseXtb";
import { readJson, writeJson } from "./storage";

const KEYS = { xtb: "export.json", revolut: "export-revolut.json" } as const;
export type Broker = keyof typeof KEYS;

export interface StoredExport extends ParsedExport {
  importedAt: string;
  sourceFile: string;
}

export async function saveExport(data: ParsedExport, sourceFile: string, broker: Broker = "xtb"): Promise<void> {
  const payload: StoredExport = { ...data, importedAt: new Date().toISOString(), sourceFile };
  await writeJson(KEYS[broker], payload);
}

/** Combine two brokers' exports into one: concatenated cashOps (chronological) + closed positions. */
function mergeExports(a: StoredExport | null, b: StoredExport | null): StoredExport | null {
  if (!a) return b;
  if (!b) return a;
  return {
    accountNumber: [a.accountNumber, b.accountNumber].filter(Boolean).join(" + "),
    cashOps: [...a.cashOps, ...b.cashOps].sort((x, y) => x.time.localeCompare(y.time)),
    closedPositions: [...a.closedPositions, ...b.closedPositions],
    importedAt: a.importedAt > b.importedAt ? a.importedAt : b.importedAt,
    sourceFile: [a.sourceFile, b.sourceFile].filter(Boolean).join(" + "),
  };
}

/** Loads and merges every broker's stored export into one combined portfolio. */
export async function loadExport(): Promise<StoredExport | null> {
  const [xtb, revolut] = await Promise.all([
    readJson<StoredExport>(KEYS.xtb),
    readJson<StoredExport>(KEYS.revolut),
  ]);
  return mergeExports(xtb, revolut);
}
