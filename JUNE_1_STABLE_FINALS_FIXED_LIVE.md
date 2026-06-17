# june-1-stable-finals-transition-fix

Pre-deploy checkpoint marker. Fixes the "flash to Ready Up, then back
to Game Over" symptom that the host hit during a 4-player test run
between Semifinal 2 and Finals.

## What was wrong

When a tournament match ended and the server spun up the next round's
room, the winners' browsers would:

1. Show the Game Over screen for the just-finished match (correct).
2. Briefly flash the next room's "Ready Up / Start Match" screen (bug).
3. Snap back to the old Game Over screen (bug).

## Root cause

When `createMatchRoomAndAssign` runs for the next round, it calls
`socket.join(newRoomCode)` for both winners — but their socket is
still joined to the OLD completed match room. So broadcasts to
either room reach the client, and the `game_state` handler in
`useSocket` was unconditionally overwriting state, causing it to
ping-pong between the two rooms.

## Fix (client-only, no server change)

`useSocket` now tracks which room URL the user is actually viewing
(`activeRoomRef`) and drops `game_state` events whose `roomCode`
doesn't match. `Room.tsx` registers its current room on mount and
clears it on unmount. The same hook also wipes stale state when the
active room changes, so the existing re-attach effect fires cleanly
for the new room instead of rendering the old room's last frame.

Why client-only:
- Server change (`socket.leave(oldRoom)` on game-over) was considered
  but rejected: it would break spectator views of completed matches
  and adds risk to the broadcast plumbing. The client filter is
  comprehensive (catches foreign-room events from any source) and
  touches zero socket / engine code.

## What was NOT touched (per pre-event freeze)

- No engine, scoring, bidding, dealing, trick-taking changes
- No socket protocol or server-side broadcast changes
- No tournament bracket / advancement logic changes
- No DB schema changes
- No new tests for already-tested behavior

## Verification

- Typecheck: 4/4 packages clean
- Test sweep: 190/190 pass
  (finals-seating 10, rules 84, tournament-tx 45, admin 16,
  replace-player 18, bracket-score 15, tournament-no-rematch 2)
- Dev API healthz: 200

## Rollback ladder (newest → oldest)

- **THIS** — finals transition flash fix (useSocket room filter)
- `c57d775` — host tools safe slice (overview + share & export +
  player status)
- `8b3c285` — tournament ghost-rematch fix
- `8e7f114` — finals-seating reclaim fix
- `65968275` — mobile bid-scroll fix
- `e7cb6ad` — invite-link 404 fix
- `e937b50` — king-table-june-1-stable anchor

## Operational reminders

- Room state is in-memory. **Do not redeploy during the live event**
  or in-progress brackets will be wiped.
- The filter is a no-op outside `/room/<CODE>` pages (Tournament,
  HostDashboard, Lobby don't render gameState).
