---
name: Spades room-lock teardown
description: Any destructive room teardown (remake, force-forfeit) must drain in-flight commits via withRoomLock before deleting state.
---

Rule: any code path that deletes a Spades game room's in-memory state (`cleanupRoom`, `deleteRoomState`) or detaches its bracket pointer MUST execute inside `withRoomLock(roomCode, async () => {...})` over the OLD room code. Detach the bracket pointer only AFTER the lock has released.

**Why:** the engine's `commit()` calls `updateRoom(state)` which writes back into the `rooms` Map. If a `play_card` / trick-resolve / turn-timer pipeline is mid-flight under that room's lock when an admin remake fires, racing the cleanup outside the lock lets the in-flight commit resurrect the room AFTER we deleted it. The bracket then points to the new room while a ghost room keeps emitting events to its old socket.io room — split-brain. Architect caught this in Phase 6 host-tools review.

**How to apply:** before calling `cleanupRoom(roomCode)` / `deleteRoomState(roomCode)` / `detachMatchRoom(t, matchId)` (for an in-progress match), do the cleanup inside `await withRoomLock(roomCode, async () => { clearTurnTimer; cleanupRoom; await deleteRoomState; emit room_remade })`, THEN detach the bracket pointer. Same principle for `forfeitTournamentMatch` (which already does this) — any future "tear down a live room" admin action inherits this requirement. The `withRoomLock` queue from `persistence.ts` is the canonical drain barrier.
