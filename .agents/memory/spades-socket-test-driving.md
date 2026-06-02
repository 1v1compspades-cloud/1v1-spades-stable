---
name: Driving Spades matches over real socket.io in tests
description: Why socket-level tournament/game tests must be event-driven off game_state, not ack-driven on start_game
---

When writing live socket.io e2e tests that drive a Spades match to completion
(e.g. tournament bracket simulations through the proxy), do NOT `await` an ack on
`start_game`.

**The rule:** `start_game` has no ack callback on the server, so any
emit-with-callback on it never resolves and silently hangs until your client-side
ack timeout fires. A test that does `await emitAck(sock, "start_game", ...)` will
block for the full timeout every match and only "pass" because concurrent matches
overlap under a generous deadline — pure flake waiting to happen.

**Why:** the server pushes a sanitized `game_state` to seated players that
includes `roomCode` and `phase`. That is the real readiness signal.

**How to apply:** fire `start_game` fire-and-forget in a retry loop and watch the
per-room `phase` (fed by a `game_state` listener) flip out of `"waiting"` (→
`"coin_toss"`); only then emit the next action (`fast_finish_match`). Replace all
fixed `sleep()` pacing with this event-driven wait. `set_ready` and
`fast_finish_match` DO have acks and can be awaited normally. To exercise both
seat-0 and seat-1 wins through the real game-over → advancement path, alternate
`winnerSeat` per match (the seat-0 driver can force either seat to win via
fast_finish). Verify winner-identity progression purely from the final
`tournament_state.rounds` broadcast (each match has playerA/playerB/winnerName;
next slot = rounds[r+1][floor(p/2)], seat = p%2===0?A:B).
