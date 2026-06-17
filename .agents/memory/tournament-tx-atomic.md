---
name: Tournament bracket transaction safety
description: How to atomically advance an in-memory bracket with a DB-backed audit row.
---

# Atomic bracket advancement: snapshot + ON CONFLICT setWhere + per-tournament lock

When a piece of state lives primarily in memory but needs durable, idempotent
write-through, combine three primitives:

1. **In-memory snapshot before mutation** (`structuredClone` of every field
   you are about to touch — for tournaments: `rounds`, `eliminated`,
   `status`, `champion`, `completedAt`). On any DB failure, restore those
   exact fields. Snapshot ONLY what the function itself mutates; do not
   pull unrelated fields into the rollback (they may be mutated by other
   code paths concurrently).
2. **Per-key serial lock** (`withTournamentLock`, same Promise-chain
   pattern as the per-room lock) so two concurrent advancements for the
   same bracket cannot interleave inside one process.
3. **DB-level idempotency via `ON CONFLICT DO UPDATE … WHERE
   winnerName IS NULL` + `.returning()`**. The composite PK guards against
   duplicate inserts; the `setWhere` predicate guards against overwriting
   an already-recorded winner. Zero rows returned ⇒ another writer beat
   us; re-read inside the same tx and decide replay vs conflict.

**Why all three:** in-memory lock alone breaks across processes; DB-level
guard alone leaves the in-memory state torn on tx failure; snapshot alone
allows two concurrent writers to race.

## How to apply

- Audit row must go into the SAME `db.transaction` as the state row, or
  a crash between them leaves an unaudited advancement.
- Return a discriminated union (`advanced` | `replay` | `rejected`) so the
  caller can decide whether to fire side effects (broadcast, room creation).
  A `replay` MUST suppress all broadcasts — otherwise duplicate `game_over`
  events double-emit `tournament_eliminated`, etc.
- Treat `firstTime: false` after a successful tx (DB had row, in-memory
  didn't) as `advanced` not `replay` — the caller's process never broadcast,
  so the side effects must fire even though the audit row was not re-written.
- "Fire-and-forget" follow-up work after the tx commits (e.g. creating
  next-round rooms) is NOT inside the transaction. If you need that to
  survive a crash too, it has to live in a separate recovery routine that
  reads the persisted bracket and reconstructs missing rooms.
