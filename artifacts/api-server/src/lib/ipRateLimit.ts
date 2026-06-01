/**
 * Sliding-window rate limiter keyed by IP address.
 * Unlike the per-socket bucket in socket.ts, these buckets are NOT cleared on
 * disconnect, so an attacker cannot bypass the limit by reconnecting.
 *
 * The bucket map is bounded: when MAX_IP_BUCKET_KEYS is reached the module
 * first evicts keys whose entire timestamp window has gone stale, then rejects
 * new-key insertions if the map is still full after eviction. This prevents
 * an attacker from inflating the map by supplying large numbers of novel IP
 * strings (e.g. via a spoofed XFF header).
 */
const ipBuckets = new Map<string, number[]>();

/** Hard ceiling on concurrent tracked IPs. 10 k entries ≈ a few hundred KB. */
const MAX_IP_BUCKET_KEYS = 10_000;

/**
 * Drop every key whose entire sliding window has expired.
 * Called lazily before inserting a new key.
 */
function evictStaleKeys(windowMs: number): void {
  const now = Date.now();
  for (const [k, ts] of ipBuckets) {
    if (ts.every((t) => now - t >= windowMs)) {
      ipBuckets.delete(k);
    }
  }
}

/**
 * Returns true if the call should proceed; false if the budget is exhausted
 * OR the limiter map is full and this would be a new key (fail-closed).
 * `limit` actions per `windowMs` are allowed per (ip, kind) pair.
 */
export function checkIpRate(
  ip: string,
  kind: string,
  limit: number,
  windowMs: number
): boolean {
  const key = `${ip}:${kind}`;
  const now = Date.now();
  const existing = ipBuckets.get(key);

  if (existing !== undefined) {
    const fresh = existing.filter((t) => now - t < windowMs);
    if (fresh.length >= limit) {
      ipBuckets.set(key, fresh);
      return false;
    }
    fresh.push(now);
    ipBuckets.set(key, fresh);
    return true;
  }

  // New key — guard against unbounded map growth before inserting.
  if (ipBuckets.size >= MAX_IP_BUCKET_KEYS) {
    evictStaleKeys(windowMs);
    // If still full after eviction, fail-closed: don't insert a new key.
    if (ipBuckets.size >= MAX_IP_BUCKET_KEYS) {
      return false;
    }
  }
  ipBuckets.set(key, [now]);
  return true;
}
