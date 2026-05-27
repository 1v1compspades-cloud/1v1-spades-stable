# Spades Multiplayer

A 2-player competitive Spades card game with hidden hands, bidding, turn synchronization, and real-time WebSocket multiplayer.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API + Socket.io server (port 8080)
- `pnpm --filter @workspace/spades-game run dev` — run the React frontend (port 21046)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io
- DB: none (game state is in-memory)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui + socket.io-client

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for REST endpoints)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/game/engine.ts` — full Spades game engine (deck, bidding, trick-taking, scoring)
- `artifacts/api-server/src/game/deck.ts` — card types, deck creation, shuffle, trick winner logic
- `artifacts/api-server/src/game/socket.ts` — Socket.io server (room management, game events)
- `artifacts/api-server/src/routes/rooms.ts` — REST endpoints for rooms
- `artifacts/spades-game/src/hooks/useSocket.tsx` — Socket.io client context/provider
- `artifacts/spades-game/src/hooks/useGameStorage.ts` — localStorage persistence
- `artifacts/spades-game/src/pages/Lobby.tsx` — lobby (create/join room)
- `artifacts/spades-game/src/pages/Room.tsx` — full game room (bidding, play, scoring, spectator view)
- `artifacts/spades-game/src/components/Card.tsx` — playing card visual component
- `artifacts/spades-game/src/lib/game.ts` — shared game types for frontend

## Architecture decisions

- Game state is purely in-memory on the server (Map<roomCode, GameState>). No database needed for an ephemeral real-time game.
- Socket.io runs on the same HTTP server as Express. The proxy routes `/socket.io` to the API server alongside `/api`.
- Each player only receives their own hand; opponent hand size (count) is sent but not the cards.
- Spectators are stored in `GameState.spectators[]`. They receive a sanitized view with empty `hand` and `handSizes: [n0, n1]` for both seats. Spectator events: `join_as_spectator`, `reconnect_spectator`. All `place_bid`/`play_card` checks are seat-based (`players.findIndex`), so spectators are naturally rejected.
- Every state push goes through `broadcastState(io, state)` which fans out to both players AND all spectators with their respective sanitized views.
- Spades game engine is deterministic and server-authoritative — all move validation happens server-side.
- The react-vite frontend artifact is served at `/` (root); the API+WS server is at `/api` and `/socket.io`.

## Product

Two players can play a full head-to-head Spades match in real time via their browsers. The game enforces all standard Spades rules: hidden hands, sequential bidding, suit-following, spades-broken rule, nil bids (1v1 Competitive house rule: ±125), tier-based bag penalties (pre-round score < 250 → every 5 bags = −50; pre-round score ≥ 250 → every 10 bags = −100; threshold is locked at round start), and set penalties. First player to reach the target (250 or 500) and lead wins. Tied at target triggers a 3-round tiebreaker block; persistent tie starts a new block.

Spectators can join any room with the room code and watch live. They see scores, bids, tricks, card counts, played cards, round summaries, and the game-over screen — but never see either player's hand. Spectators cannot bid, play, or advance the game. Multiple spectators per room are allowed. Refresh restores spectators as spectators and players as players.

## Custom Tournament mode

Single-elimination bracket of 4, 8, 16, or 32 players, random seeding, every match is a standard 1v1 game.

- Server: `artifacts/api-server/src/game/tournament.ts` — Tournament store, bracket build/advance, `recordMatchResult`, `setPendingAssignment`.
- Socket events: `create_tournament`, `join_tournament`, `leave_tournament`, `subscribe_tournament`, `start_tournament` + server pushes `tournament_state`, `match_assigned`, `tournament_eliminated`, `tournament_complete`.
- Tournament-scope Socket.io room: `tournament:${code}` (separate from per-game rooms).
- Each game room created for a bracket match carries `GameState.tournamentRef = { code, matchId }`. The `playCard` → `game_over` hook calls `advanceTournamentOnGameOver(io, state)`, mirroring the KotT hook.
- Round 1 rooms are spun up immediately at start; Round 2+ rooms are created lazily in `recordMatchResult` once both feeder matches resolve.
- Match labels for tournament rooms: `"${name} · R${round} M${pos+1}"` or `"${name} · Finals"`.
- Frontend page: `artifacts/spades-game/src/pages/Tournament.tsx` — lobby, bracket, my-match CTA, champion screen. Lobby's `custom` mode swaps the Create/Join buttons to Create Tournament / Join Tournament.

### Tournament identity & reconnect (token-based)

- Every tournament participant (host + joiners) is issued a per-player secret token at join time (crypto.randomUUID). The token is returned in the create/join callback and the client stores it in localStorage under `spades_tournament_token_${CODE}`. The token is NEVER included in `sanitizeTournament` (no leak to other clients).
- `subscribe_tournament` only rebinds a player's socketId when BOTH the claimed name AND a matching token are presented. Without that, anyone who knew a participant's display name could hijack their seat (and their future `match_assigned`).
- `start_tournament` accepts EITHER the host's current socketId OR the host token — so a host can refresh in the lobby and still start.
- `reattachPlayerSocket` also refreshes `t.hostSocketId` when the reconnecting player is the host.
- `createMatchRoomAndAssign` writes a `pendingAssignment` onto each player record. On an authenticated `subscribe_tournament`, if a pending assignment exists, the server re-emits `match_assigned` (and re-joins the game room) — so a refresh on the tournament page during a live match lands the player back into their seat. `recordMatchResult` clears `pendingAssignment` for both players of the resolved match.
- Fresh-join path rejects duplicate names (case-insensitive, trimmed). Reconnecting from the same browser works because the cached token is passed through `joinTournament`.

## Match labels (auto-set for tournament matches)

- Server auto-sets `GameState.matchLabel` for tournament rooms to `"${tournamentName} · ${roundLabel}"`. Round labels: `Finals`, `Semifinal N`, `Quarterfinal N`, `Round of 16 · M{n}`, `Round of 32 · M{n}` (`roundLabelForMatch` in socket.ts; mirrored in Tournament.tsx bracket headers).
- Quick Match and King of the Table rooms have NO matchLabel — the manual label widget was removed from the Lobby once real Tournament mode shipped.
- Label is sent in both player and spectator sanitized views; shown in waiting screens, in-game status banner header, spectator footer, and game-over overlay.
- Game-over overlay has **Copy result** (plain text) and **Copy for Discord** (code-block) buttons. The Discord block contains: match label, winner/loser + final scores, rounds played, target, room code.

## KotT join-when-full fallback

When a third+ player clicks Join Match on a King-of-the-Table room (mode=`king`) and both seats are filled, the Lobby catches "Room is full" and automatically retries as `join_as_spectator` + `join_queue`. The user lands in `/room/<code>` as a spectator + queued challenger and auto-rotates into the loser's seat when the next match ends (per the existing `scheduleKingNextMatch` flow). Quick Match rooms (mode=`quick`) still hard-cap at 2 seats and reject the third joiner.

## Bidding order (coin toss + alternation)

- Coin toss happens ONCE per match (server-side `performCoinToss`, fired by `start_game`).
- The coin toss WINNER bids SECOND in Round 1. The LOSER bids FIRST.
- After Round 1, bidding order alternates every round — implemented by `getFirstBidderForRound(state, roundNumber)` (odd round → `firstBidderRound1`; even → opposite seat). `startRound` uses this for `currentBidder`.
- `GameState` carries `coinFlipWinner` and `firstBidderRound1` (both `0 | 1 | null`); both are sent to player and spectator sanitized views.
- `phase: "coin_toss"` is broadcast for ~3.5s before Round 1 deal so all 3 roles see the result with an overlay (`coin-toss-overlay` testid).
- `resetMatch` (New Match button) clears coin state so the next match re-flips.

## Gotchas

- Always restart the API Server workflow after backend changes; the frontend is hot-reloaded by Vite.
- The `/socket.io` path must remain in `artifacts/api-server/.replit-artifact/artifact.toml` `paths` array or the WebSocket proxy will silently drop connections.
- Room state is lost on server restart (in-memory only).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
