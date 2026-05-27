---
name: Per-room serial lock pattern
description: Correct shape of a per-key FIFO promise-chain lock with map cleanup.
---

A per-key serial queue built on chained promises looks like:

```ts
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);            // run even if prev rejected
  const handle = next.catch(() => undefined); // swallowed for awaiters
  locks.set(key, handle);
  try { return await next; }
  finally {
    if (locks.get(key) === handle) locks.delete(key); // identity check
  }
}
```

**Why:** an earlier version used `Promise.race([stored, Promise.resolve("settled")])` in `finally` to decide whether to evict. That race always resolves immediately to `"settled"` because the literal is already resolved, so the map entry gets deleted even when a newer caller is still queued — breaking FIFO and re-introducing the concurrency the lock was meant to prevent.

**How to apply:** never `await` inside the cleanup `finally`. Identity-compare against the exact handle this call stored. Leaks only happen if a holder never settles (a real hung promise), which is expected behavior for any queue.
