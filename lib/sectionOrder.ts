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

  // Caps against unbounded growth from a malicious/malformed write — relevant mainly
  // for the public, unauthenticated /demo instance of this store (see
  // app/api/demo/section-order). `loadSectionOrder` above already filters down to
  // known ids on read, so a garbage array can't corrupt what the app shows — this
  // just keeps the file on disk from growing without bound in the meantime.
  const MAX_ORDER_LEN = 100;
  const MAX_ID_LEN = 60;

  function saveSectionOrder(order: string[]): Promise<string[]> {
    return serialized(async () => {
      const safeOrder = order.slice(0, MAX_ORDER_LEN).map((id) => id.slice(0, MAX_ID_LEN));
      await writeJson(cacheKey, safeOrder);
      return safeOrder;
    });
  }

  return { loadSectionOrder, saveSectionOrder };
}

export const { loadSectionOrder, saveSectionOrder } = createSectionOrderStore("sectionOrder.json");
