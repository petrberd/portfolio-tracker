/**
 * `fetch()` with a hard timeout. Every external call in this app talks to a third-party site
 * (Yahoo, stockanalysis.com, Nasdaq) with no SLA and no timeout of its own — without one, a
 * single slow/hanging upstream blocks the whole request until Netlify's own function timeout
 * kills it and returns a 502 to the user. Real incident: 2026-07-14, `/api/demo/portfolio` and
 * `/api/demo/earnings` both 502'd in production after ~30s once this was actually deployed and
 * exercised against the real network (fast/reliable locally, so it went unnoticed until then).
 *
 * Uses `Promise.race` against a plain `setTimeout` rejection rather than passing an
 * `AbortSignal.timeout()` into `fetch()` — tried that first, but confirmed live (same
 * incident) that requests kept hanging to Netlify's own ~30s function limit regardless of a
 * much shorter `signal` timeout, meaning Next.js's patched `fetch()` on Netlify doesn't
 * reliably honor an externally supplied `AbortSignal`. Racing instead guarantees THIS
 * function's promise settles on time even if the underlying `fetch()` call keeps running in
 * the background — the caller gets control back, which is what actually matters here (we
 * don't need to free the socket immediately, just not hang the whole request on it).
 *
 * Every `lib/*.ts` module that calls an external host should use this instead of bare `fetch`.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  return Promise.race([
    fetch(url, init),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`fetchWithTimeout: timed out after ${timeoutMs}ms — ${url}`)), timeoutMs)),
  ]);
}
