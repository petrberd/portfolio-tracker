import { readJson, writeJson } from "./storage";

/**
 * Which dashboard sections the user has temporarily hidden — a personal layout
 * preference, not portfolio data, but stored server-side (not localStorage) so
 * it follows the user across devices/browsers, same as the wishlist.
 */

const CACHE_KEY = "sectionVisibility.json";

export async function loadHiddenSections(): Promise<string[]> {
  return (await readJson<string[]>(CACHE_KEY)) ?? [];
}

async function saveHiddenSections(ids: string[]): Promise<void> {
  await writeJson(CACHE_KEY, ids);
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

export function setSectionHidden(id: string, hidden: boolean): Promise<string[]> {
  return serialized(async () => {
    const ids = await loadHiddenSections();
    const next = hidden ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id);
    await saveHiddenSections(next);
    return next;
  });
}
