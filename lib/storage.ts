import { promises as fs } from "fs";
import path from "path";

/**
 * JSON persistence that works both locally and on Netlify.
 *   - Local dev: reads/writes files under `data/`.
 *   - Netlify (read-only filesystem): uses Netlify Blobs.
 * Netlify functions expose NETLIFY / NETLIFY_BLOBS_CONTEXT in their env.
 */

const useBlobs = !!(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
const DATA_DIR = path.join(process.cwd(), "data");
const STORE_NAME = "portfolio-tracker";

export async function readJson<T>(name: string): Promise<T | null> {
  if (useBlobs) {
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore(STORE_NAME);
      return ((await store.get(name, { type: "json" })) as T) ?? null;
    } catch (e) {
      console.error(`blobs read failed for ${name}`, e);
      return null;
    }
  }
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  if (useBlobs) {
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore(STORE_NAME);
      await store.setJSON(name, value);
    } catch (e) {
      console.error(`blobs write failed for ${name}`, e);
    }
    return;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(value), "utf8");
  } catch (e) {
    console.error(`fs write failed for ${name}`, e);
  }
}
