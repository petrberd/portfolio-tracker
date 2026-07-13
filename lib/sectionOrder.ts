import { readJson, writeJson } from "./storage";

/**
 * Order of the dashboard's top-level draggable blocks. A "block" is either one
 * Section or a small cluster of Sections that share a desktop grid row
 * (allocationCluster = Alokace+Pozice+Earnings, dividendsCluster =
 * Dividendy+Vklady) — clusters move as one unit so the side-by-side desktop
 * layout survives reordering.
 *
 * `createSectionOrderStore` is a factory (not a singleton) so /demo gets its
 * OWN store (data/demoSectionOrder.json, with its own default order — no
 * "wishlist" block since demo has no wishlist section) — shared across all
 * anonymous demo visitors, but must never touch the real portfolio's file.
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

export function createSectionOrderStore(cacheKey: string, defaultOrder: string[] = DEFAULT_SECTION_ORDER) {
  async function loadSectionOrder(): Promise<string[]> {
    const saved = await readJson<string[]>(cacheKey);
    if (!saved || !saved.length) return defaultOrder;
    // Keep only ids that still exist, then append any new ones the app has
    // gained since this was saved (e.g. a section added after the user's last
    // reorder) at the end, so nothing silently disappears from the dashboard.
    const known = new Set(defaultOrder);
    const kept = saved.filter((id) => known.has(id));
    const missing = defaultOrder.filter((id) => !kept.includes(id));
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

  function saveSectionOrder(order: string[]): Promise<string[]> {
    return serialized(async () => {
      await writeJson(cacheKey, order);
      return order;
    });
  }

  return { loadSectionOrder, saveSectionOrder };
}

export const { loadSectionOrder, saveSectionOrder } = createSectionOrderStore("sectionOrder.json");
