# june-1-stable-host-tools-safe-slice

Pre-deploy checkpoint marker for the Host Dashboard "safe slice"
visibility additions.

## What's in this checkpoint

Pure additive improvements to the existing Host Dashboard. No server,
no socket, no schema changes. No changes to gameplay, scoring,
bidding, tricks, timers, Quick Match, or King of the Table.

- **Overview counts in header** — "Round X of Y · N active ·
  M/Total completed" so the host sees bracket progress at a glance.
- **Share & export panel**:
  - "Copy invite" — drops the lobby URL on the clipboard.
  - "Copy bracket for Discord" — produces a code-block-formatted
    snapshot of every match with current state (winner, in-progress
    score, not started, waiting for feeder).
- **Player status panel** — consolidated list of every player with:
  - online / offline / eliminated dot,
  - current match label + room code,
  - live score line if in match,
  - status pill: In match · Waiting · Eliminated.
  Status is derived purely from the existing `admin_dashboard`
  snapshot — no new server data needed.

## What was intentionally NOT built (per host's instruction)

- Reset Match Result — high blast radius, low realistic use.
- Manual Advance — duplicates existing Mark Winner.
- Validate Bracket / health-check warnings — false-alarm risk during
  live event; existing bracket logic verified correct.
- Send Player to Correct Match — players already have a self-recovery
  path via "Back to Tournament Bracket".

## Pre-deploy verification

- Typecheck: 4/4 packages clean.
- Test sweep: 190/190 pass
  (finals-seating 10, rules 84, tournament-tx 45, admin 16,
  replace-player 18, bracket-score 15, tournament-no-rematch 2).
- Dev API healthz: 200.
- Host Dashboard renders without runtime errors.

## Rollback ladder (newest → oldest)

- **THIS** — host tools safe slice
- `8b3c285` — tournament ghost-rematch fix (server + client)
- `8e7f114` — finals-seating reclaim fix
- `65968275` — mobile bid-scroll fix
- `e7cb6ad` — invite-link 404 fix
- `e937b50` — king-table-june-1-stable anchor

## Operational reminders

- Room state is in-memory; **do not redeploy during the live event**
  or in-progress brackets will be wiped.
- Host can now post a Discord bracket update after each round using
  the "Copy bracket for Discord" button.
