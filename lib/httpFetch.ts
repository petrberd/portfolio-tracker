/**
 * `fetch()` with a hard timeout. Every external call in this app talks to a third-party site
 * (Yahoo, stockanalysis.com, Nasdaq) with no SLA and no timeout of its own — without one, a
 * single slow/hanging upstream blocks the whole request until Netlify's own function timeout
 * kills it and returns a 502 to the user. Real incident: 2026-07-14, `/api/demo/portfolio` and
 * `/api/demo/earnings` both 502'd in production after ~30s once this was actually deployed and
 * exercised against the real network (fast/reliable locally, so it went unnoticed until then).
 *
 * Every `lib/*.ts` module that calls an external host should use this instead of bare `fetch`.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
