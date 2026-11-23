// The clock both players agree on, for finding each other through the relays.
//
// Nostr relays compare the times signals are stamped with, so a device whose clock
// is off (set by hand, drifted) is heard late or not at all (see scripts/vendor.mjs).
// Before connecting, the page asks the site that served it for the time, from the
// Date header of a HEAD request for the page itself: nobody new learns anything,
// and both players end up on the server's clock whatever their own clocks say.
// Time zones play no part: these are milliseconds since the epoch.

/** How long to wait for the server before keeping this device's own clock. */
export const SYNC_TIMEOUT_MS = 4000;

/**
 * How far the server's clock is ahead of this device's, in ms, or null when the
 * server can't be asked or sends no usable Date header. Never throws.
 * @param {{fetch?: typeof fetch, url?: string, timeoutMs?: number, now?: () => number}} [o]
 */
export async function measureClockOffset(o = {}) {
  const get = o.fetch || (globalThis.fetch && globalThis.fetch.bind(globalThis));
  const url = o.url || (globalThis.location && globalThis.location.href.split('#')[0]);
  const now = o.now || Date.now;
  if (!get || !url) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller && controller.abort(), o.timeoutMs || SYNC_TIMEOUT_MS);
  try {
    const sent = now();
    const response = await get(url, { method: 'HEAD', cache: 'no-store', signal: controller && controller.signal });
    const received = now();
    const server = Date.parse((response.headers && response.headers.get('Date')) || '');
    if (!Number.isFinite(server)) return null;
    // The header counts whole seconds, so the server's moment lies somewhere in
    // that second; the answer left it about halfway through the round trip.
    return Math.round(server + 500 - (sent + received) / 2);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
