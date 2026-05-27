---
name: Spades delayed-merge state preservation
description: handlePlayResult's 700ms reveal merge must carry forward every field that can mutate during the delay window.
---

Rule: whenever you add a new "transient" field to `GameState` that can be mutated by a non-engine code path (admin action, reconnect bookkeeping, roster change), you MUST add it to the merge inside `handlePlayResult`'s `setTimeout(..., SHUFFLE_ANIMATION_MS / equivalent)` block — overlay `current.<field>` onto the post-engine `result.state`.

**Why:** `result.state` is computed BEFORE the trick-reveal animation window (~700ms). During that window, OTHER code paths (disconnect, reconnect, spectator join/leave, admin pause/resume, queue ops) mutate the room via `current = getRoom(...)` inside the post-delay `withRoomLock` callback. The merge already preserves `players`, `spectators`, `challengerQueue`, `ready`, `turnTimeoutMs`, `lastActiveAt`, `isPaused` — but new fields default to whatever was on the pre-reveal snapshot, silently reverting any concurrent mutation. Architect caught the missing `isPaused` carryforward in Phase 6 (host pause mid-trick was being silently undone on trick-resolve).

**How to apply:** the merge lives at the top of `setTimeout` → `withRoomLock` in `handlePlayResult` in `artifacts/api-server/src/game/socket.ts`. Symmetric path: any other place that recomputes state from a pre-async snapshot needs the same overlay. Test gap: this class of bug doesn't fail unit tests because the race is timing-only — code review is the only catch.
