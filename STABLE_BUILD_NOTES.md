# STABLE BUILD NOTES — 1v1 Spades

> Backup/security snapshot taken **before** any App Store / Codex conversion work begins.
> This documents the last-known-good, fully-verified, production web build.

## Checkpoint / branch

- **Intended branch/marker name:** `app-store-port-stable`
- **Stable commit (deployment checkpoint):** `7aea54d46b9badcadaecb0f64234b6db0877b16f`
- **Captured:** 2026-06-04 02:49 UTC
- **Production URL:** https://1v1spades.com
- **How to recover this exact state:** roll back to the checkpoint at the commit above (this is the published build), or check out the `app-store-port-stable` marker once created.

## Current game rules (DO NOT CHANGE during the port)

- **Nil made = +100**
- **Nil failed = −100** (and the failed-nil player still earns bag points for tricks taken; those tricks still count as bags)
- **Race to 250:** every **5 bags = −50** (bag count rolls over by the threshold each round)
- **Race to 500:** every **10 bags = −100** (bag count rolls over by the threshold each round)
- Standard Spades rules otherwise: hidden hands, sequential bidding, suit-following, spades-broken rule, set penalties.
- First player to reach the target (250 or 500) and lead wins. Tie at target → 3-round tiebreaker block.

## Verification results (all PASS at this checkpoint)

Run via the spades-game `tsx` binary against `artifacts/api-server/src/game/__tests__/`.

| Check | Result |
|---|---|
| Full workspace typecheck (`pnpm run typecheck`) | PASS — all 4 projects clean |
| 32-player tournament simulation (`tournament-32-sim`) | PASS — 31/31 matches, 1 champion, 164 assertions |
| Live-socket tournament E2E (`tournament-socket-e2e`) | PASS — 31/31 over the wire, 31 distinct rooms, 46 assertions |
| Scoring rules (`rules.test`) | PASS — 142/142 (nil ±100, race-250/500 bag rules) |
| KOTT loser flow (`kott-loser-flow.test`) | PASS — 9/9 |
| KOTT security + rotation (`kott-security-verify`) | PASS — 23/23 |
| Admin tools (`admin.test`) | PASS — 29/29 |
| Admin permission isolation (`admin-tools-permission-e2e`) | PASS — 11/11 |
| Reset Room permission isolation (`reset-room-permission-e2e`) | PASS — 24/24 |
| Tournament no-rematch (`tournament-no-rematch.test`) | PASS — 2/2 |
| Bracket score (`bracket-score.test`) | PASS — 15/15 |
| Tournament transaction/rollback (`tournament-tx.test`) | PASS — 45/45 (incl. an intentional simulated-DB-failure rollback test) |
| Finals seating (`finals-seating.test`) | PASS — 10/10 |
| Replace player (`replace-player.test`) | PASS — 18/18 |

## Production URLs verified (all HTTP 200)

- https://1v1spades.com/ — main playable game
- https://1v1spades.com/rules — rules page
- https://1v1spades.com/tournaments — tournaments page
- https://1v1spades.com/king-of-the-table — KOTT info page
- https://1v1spades.com/fair-play — Fair Play page
- https://1v1spades.com/discord — Discord page
- https://1v1spades.com/sitemap.xml
- https://1v1spades.com/robots.txt

## Security protections in place (DO NOT regress)

- **No host/admin token leakage** — per-player and host tokens are never included in sanitized views; verified by permission-isolation and KOTT security suites.
- **Fast Finish / End Game is admin-only** — gated by `requireFastFinishAuth` (admin socket unlocked via `admin_unlock` + `ADMIN_HOST_KEY`); seated players and spectators are rejected in every environment, including dev preview.
- **Reset Room is admin-only** — `admin_*` tournament/KOTT socket events gated by `requireAdmin` / `requireTournamentHost`; verified by reset-room permission isolation suite.
- **Spectator views never expose hidden hands** — spectators receive empty `hand` and only `handSizes` counts; players only ever receive their own hand.
- **Rules/Info menu only on setup/start screen** — gated on `phase === "waiting"`; not shown on active match, tournament, KOTT, or spectator screens.

## What must NOT change during the App Store port

Treat all of the following as frozen contracts. Do not modify:

- Gameplay logic
- Scoring (nil values, bag penalties, set penalties, target/tiebreaker)
- Bidding (coin toss, alternation, nil)
- Sockets / socket event contracts
- Tournament advancement / bracket logic
- KOTT crown / rotation logic
- Admin permissions and token gating
- Reconnect logic (per-seat / per-player tokens, grace, auto-forfeit, self-heal)
- Room state model (in-memory authority, sanitized views)
- Match logic

## Notes

- Game state is in-memory and server-authoritative; room state is lost on server restart (by design for an ephemeral real-time game).
- Always restart the API Server workflow after backend changes; the frontend is hot-reloaded by Vite.
- `/socket.io` must remain in `artifacts/api-server/.replit-artifact/artifact.toml` `paths` or the WebSocket proxy silently drops connections.
