# June 1 Event — Locked Build

## Locked at
- **Commit:** `898ae18` — "Fix blurry cards and overlapping music icon"
- **Branch:** `main` (HEAD), mirrored to `gitsafe-backup/main`
- **Working tree:** clean
- **Last published:** `a798891` (the music-icon-fix publish from earlier today). Republish `898ae18` to ship the card-sharpness + music-icon-left fix.

## Rollback ladder (most-recent first)
1. `a798891` — last published build (top-right music icon, blurry-card behavior).
2. `687cb39` — music icon fix v1 (top-right position).
3. `fcf2b80` — last commit before any music fix; full tournament stability baseline.
4. `e937b50` — king-table-june-1-stable anchor (deepest safe rollback).

All four commits are present in `git log` and reachable from `main` + `gitsafe-backup/main`.

## Final stability gate (all green)
- Workspace typecheck: ✅ Clean (api-server, mockup-sandbox, spades-game, scripts)
- Engine test suite: ✅ 178 / 178 passing
  - rules: 84/84
  - tournament-tx: 45/45
  - replace-player: 18/18
  - admin: 16/16
  - bracket-score: 15/15

## DO NOT
- Restart the API server during the event (in-memory tournament state).
- Edit any file in this commit before the event ends.
- Push new commits to `main` until post-event.

## If something breaks
- Replit Deployments → Rollback to the appropriate commit above.
- Or use the manual Custom 1v1 + Twitch bracket fallback documented in the event ops note.
