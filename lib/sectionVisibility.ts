import { readJson, writeJson } from "./storage";

/**
 * Which dashboard sections the user has temporarily hidden — a personal layout
 * preference, not portfolio data, but stored server-side (not localStorage) so
 * it follows the user across devices/browsers, same as the wishlist.
 *
 * `createSectionVisibilityStore` is a factory (not a singleton) so the public
 * /demo page can get its OWN store (data/demoSectionVisibility.json) — it's
 * shared across all anonymous demo visitors, but must never touch the real
 * portfolio's file.
 */

// Caps against unbounded growth from repeated writes with novel ids — relevant
// mainly for the public, unauthenticated /demo instance of this store (see
// app/api/demo/section-visibility), which anyone can POST to without rate limiting.
// The app only ever sends its own known section ids (a few dozen chars, well under
// these caps), so legitimate use is unaffected.
const MAX_ID_LEN = 60;
const MAX_HIDDEN = 100;

export function createSectionVisibilityStore(cacheKey: string) {
  async function loadHiddenSections(): Promise<string[]> {
    return (await readJson<string[]>(cacheKey)) ?? [];
  }

  // Same read-modify-write race as lib/wishlist.ts — serialize mutations through
  // one promise chain so two near-simultaneous toggles don't clobber each other.
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function setSectionHidden(id: string, hidden: boolean): Promise<string[]> {
    return serialized(async () => {
      const ids = await loadHiddenSections();
      const safeId = id.slice(0, MAX_ID_LEN);
      const next = hidden
        ? ids.includes(safeId) || ids.length >= MAX_HIDDEN
          ? ids
          : [...ids, safeId]
        : ids.filter((x) => x !== safeId);
      await writeJson(cacheKey, next);
      return next;
    });
  }

  return { loadHiddenSections, setSectionHidden };
}

export const { loadHiddenSections, setSectionHidden } = createSectionVisibilityStore("sectionVisibility.json");
