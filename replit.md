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

Two players can play a full head-to-head Spades match in real time via their browsers. The game enforces all standard Spades rules: hidden hands, sequential bidding, suit-following, spades-broken rule, nil bids, bag penalties (10 bags = -100), and set penalties. First player to reach the target (250 or 500) and lead wins. Tied at target triggers a 3-round tiebreaker block; persistent tie starts a new block.

Spectators can join any room with the room code and watch live. They see scores, bids, tricks, card counts, played cards, round summaries, and the game-over screen — but never see either player's hand. Spectators cannot bid, play, or advance the game. Multiple spectators per room are allowed. Refresh restores spectators as spectators and players as players.

## Mock tournament tools

Lightweight helpers for running 8-player test brackets manually (no real bracket UI yet):

- Optional **Match label** field in the Lobby (e.g. "Quarterfinal 1", "Finals"). Capped at 40 chars server-side; trimmed blanks become `undefined`.
- Label is stored on `GameState.matchLabel`, sent in both player and spectator sanitized views.
- Label is shown to both roles in: waiting screens, in-game status banner header (active play for players), spectator footer, and game-over overlay.
- Game-over overlay has **Copy result** (plain text) and **Copy for Discord** (code-block) buttons. The Discord block contains: match label, winner/loser + final scores, rounds played, target, room code.

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
