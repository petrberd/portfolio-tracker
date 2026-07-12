import { readJson, writeJson } from "./storage";

/**
 * Order of the dashboard's top-level draggable blocks. A "block" is either one
 * Section or a small cluster of Sections that share a desktop grid row
 * (allocationCluster = Alokace+Pozice+Earnings, dividendsCluster =
 * Dividendy+Vklady) — clusters move as one unit so the side-by-side desktop
 * layout survives reordering.
 */
export const DEFAULT_SECTION_ORDER = [
  "value",
  "performance",
  "benchmark",
  "vix",
  "allocationCluster",
  "wishlist",
  "analysts",
  "dividendsCluster",
  "dividendProjection",
  "tax",
];

const CACHE_KEY = "sectionOrder.json";

export async function loadSectionOrder(): Promise<string[]> {
  const saved = await readJson<string[]>(CACHE_KEY);
  if (!saved || !saved.length) return DEFAULT_SECTION_ORDER;
  // Keep only ids that still exist, then append any new ones the app has
  // gained since this was saved (e.g. a section added after the user's last
  // reorder) at the end, so nothing silently disappears from the dashboard.
  const known = new Set(DEFAULT_SECTION_ORDER);
  const kept = saved.filter((id) => known.has(id));
  const missing = DEFAULT_SECTION_ORDER.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

// Same read-modify-write race as lib/wishlist.ts / lib/sectionVisibility.ts.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export function saveSectionOrder(order: string[]): Promise<string[]> {
  return serialized(async () => {
    await writeJson(CACHE_KEY, order);
    return order;
  });
}
