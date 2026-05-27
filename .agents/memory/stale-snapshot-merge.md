---
name: Stale snapshot merge across delays
description: Snapshots captured before a setTimeout reveal must be overlaid with freshly-read transient fields before being persisted.
---

When game-engine logic computes a `nextState` and then a UI reveal (e.g. a ~700ms trick-flip animation) delays the commit, any mutations that arrive in that window — disconnects, reconnects, spectator joins/leaves, queue changes, activity-timestamp bumps — land on the *current* in-memory state. Committing the pre-delay `nextState` wholesale clobbers them.

**Pattern:**

```ts
setTimeout(() => withLock(key, async () => {
  const current = getCurrent(key);
  if (!current) return;
  const merged = {
    ...nextState,
    // overlay anything that can change during the delay
    players: current.players,
    spectators: current.spectators,
    challengerQueue: current.challengerQueue,
    ready: current.ready,
    lastActiveAt: current.lastActiveAt,
    turnTimeoutMs: current.turnTimeoutMs,
  };
  await commit(merged, ...);
}), DELAY_MS);
```

**Why:** the engine result is authoritative for *gameplay* fields (phase, scores, hands, tricks, bids). The roster, presence, and activity-timestamp fields are authoritative on *current* because async handlers may have mutated them during the delay. Mixing both correctly is the only safe commit.

**How to apply:** every place we hold a state snapshot across an `await` or `setTimeout` and later persist it, audit which fields can independently mutate in that window and overlay them from a freshly-read current state.
