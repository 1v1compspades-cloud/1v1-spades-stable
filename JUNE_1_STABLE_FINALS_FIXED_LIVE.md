# june-1-stable-finals-fixed-live

Pre-deploy checkpoint marker for the tournament finals-seating reclaim fix.

## What's in this checkpoint

- Tournament finals-seating reclaim: `join_room` handler now reclaims a
  pre-seated tournament slot by name when the original socket has gone
  stale (the root cause of the live 4-player dry-run finals failure).
- Security guard: reclaim path refuses to bypass tokenized-seat
  reconnect-token validation. Once a seat is tokenized, the client must
  use `reconnect_player` with the token (which Room.tsx already does).
- 10-test regression suite at
  `artifacts/api-server/src/game/__tests__/finals-seating.test.mts`.

## Pre-deploy verification

- Typecheck: 4/4 packages clean (api-server, spades-game,
  mockup-sandbox, scripts).
- Test sweep: 188/188 pass — finals-seating 10, rules 84,
  tournament-tx 45, admin 16, replace-player 18, bracket-score 15.
- Dev API healthz: 200.

## Rollback ladder (newest → oldest)

- THIS checkpoint — finals-seating reclaim (server-only) +
  hardening
- 65968275 — mobile bid-scroll fix (Room.tsx overlay
  pointer-events)
- e7cb6ad — invite-link 404 fix (Tournament.tsx
  `import.meta.env.BASE_URL`)
- e937b50 — king-table-june-1-stable anchor

## Operational reminders

- Room state is in-memory; **do not redeploy during the live event**
  or every in-progress tournament will be wiped.
- This fix layers cleanly on top of all prior stable checkpoints.
