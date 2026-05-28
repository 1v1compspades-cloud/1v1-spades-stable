# june-1-stable-tournament-no-rematch

Pre-deploy checkpoint marker for the tournament "ghost rematch" fix.

## What's in this checkpoint

- **Tournament ghost-rematch bug fixed.** The host of a finished
  tournament semifinal could click "Start New Match" on the game-over
  screen and spin up a rematch in the same room, in parallel with the
  real next match. That's what produced the dry-run symptom:
  "Grace vs Kinzie rematch happened in the SF2 slot while Shaw beat me."
- Server now rejects `new_match` and `reset_room` for any room with
  `tournamentRef` set. Audit-logged via `logger.warn`.
- Client hides the "Start New Match" button entirely when in a
  tournament room. Players go through "Back to Tournament Bracket"
  instead.
- Host admin tools (`admin_remake_room`, `admin_mark_winner`,
  `admin_force_forfeit`) are **unchanged** — those are the legitimate
  ways to destroy/recreate a tournament room.

## Pre-deploy verification

- Typecheck: 4/4 packages clean (api-server, spades-game,
  mockup-sandbox, scripts).
- Test sweep: 190/190 pass
  (finals-seating 10, rules 84, tournament-tx 45, admin 16,
  replace-player 18, bracket-score 15, tournament-no-rematch 2).
- Dev API healthz: 200.

## Rollback ladder (newest → oldest)

- **THIS** — tournament ghost-rematch fix
- `8e7f114` — finals-seating reclaim fix (server + 10 tests)
- `65968275` — mobile bid-scroll fix
- `e7cb6ad` — invite-link 404 fix
- `e937b50` — king-table-june-1-stable anchor

## Operational reminders

- Room state is in-memory; **do not redeploy during the live event**
  or in-progress brackets will be wiped.
- This fix layers cleanly on top of all prior stable checkpoints.
- Host operational note: if a tournament match room genuinely needs to
  be reset (player disconnect, room glitch), use the **Host Tools
  Dashboard** → "Remake Current Match Room" — NOT the in-room reset
  button (which now correctly refuses for tournament rooms).
