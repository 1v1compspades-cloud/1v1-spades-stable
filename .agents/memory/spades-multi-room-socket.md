---
name: Spades multi-room socket membership
description: Socket can be joined to >1 game-room at once during tournament transitions; client must filter game_state by roomCode.
---

After a tournament match ends, the winners' sockets remain in the
completed match's socket.io room AND get `socket.join(newRoom)` for
the next round. Result: a single client receives `game_state`
broadcasts for multiple rooms in flight.

**Rule:** Any client-side `game_state` handler MUST filter by
`state.roomCode === activeRoom` (the URL room the user is viewing),
or the visible state will flip-flop between rooms.

**Why:** Removing socket membership server-side on game-over would
break spectators of completed matches. A client-side filter is the
right boundary — it costs nothing and tolerates any future broadcast
plumbing change.

**How to apply:** Any new hook/component that consumes raw
`game_state` events must respect the active-room filter. If you add
a new broadcast that should reach the user regardless of room (rare
— admin audit, tournament_state already use their own events), use
a dedicated event name, NOT `game_state`.
