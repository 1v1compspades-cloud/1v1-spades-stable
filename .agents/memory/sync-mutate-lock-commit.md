---
name: Sync-mutate-then-lock-commit
description: When the per-room lock key is unknown up front, do the sync mutation first and lock only for the durable commit.
---

For a disconnect handler that doesn't know which room a socket belongs to, two patterns were considered:

- **Pre-scan → lock → mutate-inside-lock**: has a race where an in-flight join on the same socket completes between the pre-scan and the lock acquisition, so the actual remove inside the lock acts on a different room than the one we locked.
- **Sync-mutate → lock-commit** (preferred): call the sync scan-and-mutate function first (atomic from JS's POV — no other handler can observe a half-removed slot), then take the lock on the returned room's code purely to serialize the durable persist + broadcast.

**Why:** JS is single-threaded; a sync mutation is atomic. The per-room lock exists to serialize async work (DB writes, broadcasts) against other in-flight handlers — it doesn't have to wrap the in-memory mutation itself when that mutation is sync and the function reports back which room it touched.

**How to apply:** only relevant when the lock key is derived from the mutation result. Async mutations, or sync mutations on a known room, should still happen inside the lock.
