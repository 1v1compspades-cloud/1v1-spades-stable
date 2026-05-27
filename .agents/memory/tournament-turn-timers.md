---
name: Tournament turn timers
description: How the server-side turn-timer / auto-action system in Spades works and the subtle invariants it depends on.
---

# Arm-before-broadcast

Every code path that hands a turn to a new actor must call `armTurnTimer(io, state)` BEFORE `broadcastState(io, state)`. The arm mutates `state.turnDeadline`, so broadcasting first ships a stale (null) deadline and clients flicker.

**Why:** Clients render a countdown from `turnDeadline`. Two pushes (broadcast-then-arm-then-rebroadcast) would either skip the countdown for one frame or double-broadcast every turn.

# Stale-callback guard uses deadline equality, not actor identity

`armTurnTimer`'s `setTimeout` callback bails on `cur.turnDeadline !== deadline`. Do NOT switch this to comparing actor index — actors can legitimately reappear (e.g., same player bids then plays first card next phase) and the equality check is the only authoritative "is this scheduled fire still relevant" marker.

# turnTimeoutMs survives state transitions because engine spreads

`startRound`, `performCoinToss`, `resetMatch`, and the `dealWithShuffleAnimation` phase swaps all build new state via `{ ...state, ...changes }`. That spread preserves `turnTimeoutMs` automatically — tournament rooms keep their clock across rounds without explicit copy.

**Trap:** If the engine ever stops spreading state in a new transition (e.g., constructs a fresh GameState from scratch), the timer silently disappears mid-match. Any new state-building helper must either spread or explicitly carry `turnTimeoutMs`.

The one place the engine DOESN'T own the swap — the `result.state` returned from `playCard` — does need an explicit `result.state.turnTimeoutMs = preState.turnTimeoutMs` copy inside `handlePlayResult`, because the engine builds that next-trick state without knowing the room's clock setting.

# Auto-forfeit on disconnect is bracket-keyed, not socket-keyed

`scheduleAutoForfeit` keys timers by `${roomCode}:${playerIndex}`, snapshotted from the room state BEFORE `removePlayerFromRoom` nulls the seat. The reconnect path (`reconnect_player`) clears by the same key. Don't switch to socket-id keying — sockets are ephemeral and the player may reconnect with a new socket.

# Host token for force-forfeit lives on the player record

`Tournament` itself has no `hostToken` field. The host's secret is `tournament.players.find(p => p.name === hostName)?.token`. Anyone tempted to add `hostToken` to the Tournament type is duplicating state — match by name + token off the player record.
