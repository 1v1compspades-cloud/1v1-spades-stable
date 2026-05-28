---
name: Spades tournament finals-seating reclaim
description: createMatchRoomAndAssign bakes current socketIds into bracket-match seats; if a finalist's socket reconnects before they land on /room/<code>, a fresh join_room sees "Room is full" — join_room must reclaim by name for tournament rooms.
---

`createMatchRoomAndAssign` creates a bracket match's GameState by calling
`engine.createRoom(playerA, sA, ...)` + `engine.joinRoom(code, playerB, sB)`
where `sA`/`sB` are each finalist's *current* socketId at room-creation
time. That socketId can go stale before the finalist navigates to
`/room/<finalsCode>` (socket drop+reconnect, page refresh, transport
flip, slow client). When the new socket arrives, the client may fall
into the fresh-join branch (e.g. Room.tsx stale-room-code guard wiped
`playerIndex`, or localStorage was lost) and emit `join_room`. The
engine sees seat 1 still occupied (by the dead socketId with the same
name) and rejects with "Room is full".

**Rule:** The server's `join_room` handler must, for tournament rooms
only (`state.tournamentRef` present), recognise a name-match against
an existing seat and treat it as a reconnect (swap in the new
socketId via `reconnectPlayer`). Quick Match and KotT must NOT take
this path.

**Why:** This was the root cause of the 4-player dry-run finals
failure on May 28 2026 — finalist Grace was listed as Player 2 but
NOT READY because her live socket was never bound to the pre-seated
slot, and the engine refused every subsequent `join_room` attempt.

**How to apply:** When touching `createMatchRoomAndAssign`, the
`join_room` handler, or the engine's room-fill checks, preserve the
invariant that a tournament-room seat is *reclaimable by name* from
`join_room` — AND that the reclaim path refuses tokenized seats
(`tokenizedSeats[seat] === true` → reject with "Reconnect token
required for this seat", so the client falls back to
`reconnect_player` + token). Without that gate, the reclaim path
becomes a bypass around tokenized-seat protections once the first
join has issued a token.
