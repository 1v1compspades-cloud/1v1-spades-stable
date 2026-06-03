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

Two players can play a full head-to-head Spades match in real time via their browsers. The game enforces all standard Spades rules: hidden hands, sequential bidding, suit-following, spades-broken rule, nil bids (1v1 Competitive house rule: ±100; a failed nil scores −100 + 1 per trick taken and those tricks still count as bags), mode-based bag penalties (Race to 250 → every 5 bags = −50; Race to 500 → every 10 bags = −100; the bag count rolls over by the threshold each round), and set penalties. First player to reach the target (250 or 500) and lead wins. Tied at target triggers a 3-round tiebreaker block; persistent tie starts a new block.

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

## Host admin tools (Phase 6)

Token-gated dashboard the tournament host uses to recover from disconnects, AFK, and room glitches without abandoning the bracket.

- Page: `artifacts/spades-game/src/pages/HostDashboard.tsx` at `/tournament/:code/host`. Only reachable if `spades_tournament_token_${CODE}` exists in localStorage — otherwise bounces back to `/tournament/:code`. Tournament page shows a "Host tools" button to the host only.
- Server helpers in `tournament.ts`: `requireTournamentHost(t, token)` (token-only, no socketId fallback), `appendAdminAudit` / `getAdminAuditLog` (bounded 500-entry ring buffer, in-memory), `findMatchById`, `detachMatchRoom`.
- Socket events (all in `socket.ts`, all gated by `requireTournamentHost`, all write an `AdminAuditEntry` and emit `admin_audit_appended` to the tournament room):
  - `admin_dashboard` — returns per-match snapshot incl. live phase/scores/turn/paused/last-activity + per-seat connected flag.
  - `admin_audit_log` — returns audit tail, most-recent-first.
  - `admin_pause_match` / `admin_resume_match` — sets `GameState.isPaused`; `place_bid` / `play_card` reject while paused; `armTurnTimer` no-ops while paused.
  - `admin_reset_timer` — re-arms the current actor's turn timer.
  - `admin_remake_room` — detaches old room (cleanupRoom + deleteRoomState best-effort), spins up a fresh one via `createMatchRoomAndAssign`. Players get a new `match_assigned`.
  - `admin_mark_winner` — bracket-level advance. If a live room exists, routes through `forfeitTournamentMatch` (loser = opposite seat). If no room exists, calls `recordMatchResult` directly. Idempotent on replay of same winner; rejects conflict on different winner.
  - `admin_force_forfeit` (canonical) / `tournament_force_forfeit` (legacy alias kept for back-compat) — both delegate to the same `runAdminForceForfeit` helper, both write audit.
- `GameState.isPaused?: boolean` flag is broadcast in both player and spectator sanitized views.
- Bracket-repair safety: `recordMatchResult` is already idempotent (returns `"replay"` for same winner, `"rejected"` for conflict) — `admin_mark_winner` reuses that, so a host can safely retry on flaky connections without double-advancing.
- Audit log content (in-memory): action, actor name, matchId, roomCode, free-form payload (winner seat, forfeit seat, old room code, etc.). Bracket advancements ALSO write to the DB-backed `game_audit_log` via `recordMatchResultTx`.

## Pre-start player replacement (Phase 7)

- Host-only swap of a registered player for a backup, allowed only while `t.status === "lobby"`.
- Server: `replacePlayer(code, oldName, newName)` in `tournament.ts` validates lobby status, rejects host slot, rejects duplicate names, replaces in place (preserves roster index), issues a fresh per-player token, returns `{ newPlayerToken, removedName, replacementName }`.
- Socket event `host_replace_player` (in `socket.ts`) is gated by `requireTournamentHost(t, data.token)`, throws `"Cannot replace players after the tournament has started"` if status changed, writes an `AdminAuditEntry { action: "replace_player", payload: { removedName, replacementName } }`, broadcasts `tournament_state` + `admin_audit_appended`.
- Token isolation: the new player token goes back to the host via callback only; it never enters `sanitizeTournament` (matches the existing per-player token model).
- Backup-join path: host's success dialog produces `…/tournament/<CODE>?join_name=<NAME>&join_token=<TOKEN>`. Tournament.tsx parses this query on mount, writes name + token to localStorage via existing keys (`spades_player_name`, `spades_tournament_token_${CODE}`), strips the query, and the normal `subscribe_tournament` flow then authenticates as a reconnect.
- UI: lobby roster shows a small "Replace" button on each non-host filled slot (host-only). After confirm, a copy-link dialog appears with the backup's join URL.
- Audit action union extended in BOTH `artifacts/api-server/src/game/tournament.ts` AND `artifacts/spades-game/src/lib/game.ts` (`"replace_player"`).

## Fast Finish / End Game (admin-only testing tool)

- **Admin-only** tool to end a live match instantly and route it through the **normal game-over pipeline** — used to test tournament advancement, KotT rotation, and 1v1 game-over without playing 13 tricks. There is **no dev/preview bypass**: the only caller that passes auth is the secret-key-unlocked admin (the streamer/host), in every environment including dev preview. This closes a prior leak where, on a shared preview URL, any seated player (or spectator) could end a live match.
- Server (`socket.ts`): `requireFastFinishAuth(socket)` returns `"Admin"` only when the socket is in `adminSockets` (unlocked via `admin_unlock` + `ADMIN_HOST_KEY`), else throws — fails closed for everyone else. `endMatchForTesting(io, roomCode, winnerSeat, actor)` runs in `withRoomLock`, validates phase ≠ `waiting`/`game_over` and both seats filled, sets a decisive non-tied winner score (mirrors `forfeitTournamentMatch`), commits action `"fast_finish_test"` (DB-backed audit) + `logger.info`, `broadcastState`, then calls `advanceTournamentOnGameOver` (if `tournamentRef`) and `scheduleKingNextMatch` (if `king` + queued). **No bidding/scoring/cards/bracket/KotT logic is altered** — it only forces a score and reuses existing handlers.
- Socket event `fast_finish_match {roomCode, winnerSeat}` is gated by `requireFastFinishAuth` (admin-only) + `checkRate(60/60s)` + `winnerSeat ∈ {0,1}`. Rejected attempts are `logger.warn`-ed. The rate cap is now just a **runaway-loop guard** (the caller is already fully trusted), sized to let a host drive a full 32-player bracket (max 31 matches) without tripping. Admins are exempt from the seated-in-room check (streamer/host drives KotT/tournament rooms from the side).
- Client: `fastFinishMatch(code, winnerSeat)` (plain emit + ack) in `useSocket.tsx`. `Room.tsx` gates visibility with `canFastFinish = isAdmin && phase ≠ waiting/game_over` — shown to admins only (even when spectating); never to regular players/spectators in any environment. Floating "⏩ Fast Finish" FAB → confirm overlay ("End this match for testing?") with Seat 1 / Seat 2 winner buttons (labeled with player names) + Cancel.
- Permission isolation regression test: `artifacts/api-server/src/game/__tests__/admin-tools-permission-e2e.mts` (run via the spades-game `tsx` binary) asserts seated-player `fast_finish_match` is REJECTED, non-admin `admin_*` tools are REJECTED, and admin paths succeed.

## Mid-tournament reconnect link (admin recovery)

- Admin-only rescue for a player who lost their browser / switched devices mid-event and can no longer reattach to their seat (their reconnect token only lives in server memory + their original browser's localStorage). Distinct from Phase 7 replacement: this keeps the SAME player and is allowed at ANY tournament status, not just lobby.
- Server: `reissuePlayerToken(code, playerName)` in `tournament.ts` finds the player case-insensitively and rotates ONLY `player.token` (via `makeToken()`), preserving name, roster index, and `pendingAssignment` so the new link re-routes them into their CURRENT live match. Throws on unknown tournament/player. Audit action `"reissue_token"` added to the union in BOTH `tournament.ts` and `game.ts`.
- Socket event `admin_reissue_token` (in `socket.ts`) is gated by `requireAdmin(socket)`, rate-limited (10/30s), writes `AdminAuditEntry { action: "reissue_token", payload: { playerName } }`, emits `admin_audit_appended`, and returns `{ playerToken, playerName }` to the calling admin via callback ONLY — never broadcast, never in `sanitizeTournament`.
- Backup-join path reused: the link is `…/tournament/<CODE>?join_name=<NAME>&join_token=<TOKEN>` (same format Tournament.tsx already parses for replacement); opening it writes the fresh token to localStorage and the normal `subscribe_tournament` flow re-authenticates as a reconnect.
- UI: `HostDashboard.tsx` "Player status" panel shows a per-player "Reconnect link" button (hidden for eliminated players) → copy-link dialog. Client method `adminReissueToken(code, playerName)` in `useSocket.tsx` (no token in payload; authorized by the unlocked admin socket).

## Tournament invite link

- Tournament lobby (`/tournament/<CODE>`) shows an "Invite link" panel to every roster member with a copy-to-clipboard button. The link is `${origin}${BASE_URL}/tournament/<CODE>` — points to the **tournament lobby**, NOT a 1v1 `/room/<CODE>` route.
- Visiting the link as a non-roster user shows the existing name+Join form (gated by `!iAmInRoster`). Visiting when the lobby is full shows a "Lobby full" amber banner instead — no join form, server would reject anyway with "Tournament is full".
- Copy button disables when `t.players.length >= t.size`. Capacity text on the panel updates live: `"3 slots open · 5/8"` → `"Lobby full (8/8)"`.
- Capacity rule is purely `t.size` (4/8/16/32 from `TournamentSize`); the 1v1 `maxPlayers=2` rule belongs to `engine.ts` rooms and is not used here.
- Duplicate-name guard lives in `joinTournament` (case-insensitive, trimmed) and surfaces to the user as toast `"Name already taken in this tournament"`.

## Tournament lobby start control

- The lobby's Start button is driven by a pure helper `computeStartControl(...)` in `artifacts/spades-game/src/lib/hostControls.ts` (unit-tested via `hostControls.test.mts`, run with the spades-game tsx binary). The component renders whatever the helper returns; it makes no gating decisions itself.
- States: not in roster → nothing; non-host → Leave only; host with token, not full → disabled `Need X more`; host with token, full → enabled `Start Tournament`; host whose token is missing/invalid → an amber **warning** ("Host controls unavailable on this device. Reopen using the original host link.") instead of a hidden/broken button.
- "Invalid token" is detected at runtime: `handleStart` flips `hostAuthFailed` when the server rejects start with a `…host…` message, which feeds `hasHostToken && !hostAuthFailed` into the helper. The server (`start_tournament`, token-or-host-socketId) remains the real authority.
- Mobile layout: the control row is `flex-col` on mobile / `sm:flex-row`, and the button/warning is `w-full sm:w-auto sm:ml-auto`, so the Start button stays visible directly under the player list on small screens.

## Match labels (auto-set for tournament matches)

- Server auto-sets `GameState.matchLabel` for tournament rooms to `"${tournamentName} · ${roundLabel}"`. Round labels: `Finals`, `Semifinal N`, `Quarterfinal N`, `Round of 16 · M{n}`, `Round of 32 · M{n}` (`roundLabelForMatch` in socket.ts; mirrored in Tournament.tsx bracket headers).
- Quick Match and King of the Table rooms have NO matchLabel — the manual label widget was removed from the Lobby once real Tournament mode shipped.
- Label is sent in both player and spectator sanitized views; shown in waiting screens, in-game status banner header, spectator footer, and game-over overlay.
- Game-over overlay has **Copy result** (plain text) and **Copy for Discord** (code-block) buttons. The Discord block contains: match label, winner/loser + final scores, rounds played, target, room code.

## KotT join-when-full fallback

When a third+ player clicks Join Match on a King-of-the-Table room (mode=`king`) and both seats are filled, the Lobby catches "Room is full" and automatically retries as `join_as_spectator` + `join_queue`. The user lands in `/room/<code>` as a spectator + queued challenger and auto-rotates into the loser's seat when the next match ends (per the existing `scheduleKingNextMatch` flow). Quick Match rooms (mode=`quick`) still hard-cap at 2 seats and reject the third joiner.

## KotT single-player lobby presentation (frontend-only)

- The server already holds a one-player KotT room indefinitely (in-memory; seat nulled on leave, restored on reconnect, removed only by the idle-stale sweep) — verified by socket reproduction. The "lobby doesn't hold with one player" report was purely a **frontend UX** gap, so the fix is entirely in `Room.tsx` (no server/socket/timer/engine changes).
- `Room.tsx` computes `seatedCount`, `loneSeat`, `tableHolderSeat = kingSeat ?? loneSeat`, `tableHolderName`, and a `kottLobbyState` label (`Waiting for King` / `King waiting for challenger` / `Challenger joined — ready up` / `Match in progress` / `Match complete — winner is King`).
- The lone seated player is shown as the table-holder King (`King: <name> (holding the table)`) even at streak 0, since `kingStreak` is `[0,0]` until a win. The reigning-king crown (streak>0) display is unchanged.
- Waiting screens are `isKingMode`-aware: queue panel shows a `kottLobbyState` badge (testid `kott-lobby-state`); player waiting screen shows KotT status messaging + the state in the header subtitle and relabels the invite CTA to "Copy Challenger Link"; spectator waiting copy is KotT-flavored. Non-KotT (1v1 / tournament) waiting UI is untouched (all guarded by `isKingMode` ternaries). Links remain token-free.

## KotT host controls (admin/streamer only)

- KotT "host" controls are gated on the existing secret-key admin (`requireAdmin` / `isAdmin`, unlocked via `admin_unlock` + `ADMIN_HOST_KEY`) — the streamer. There is NO new per-room host token, so invite/watch links stay token-free (consistent with the threat model).
- Engine helper `setNextChallenger(roomCode, socketId)` (`engine.ts`) splices the matching queue entry and unshifts it to the head; no-op if already head or not found.
- Socket events (`socket.ts`, all `requireAdmin`-gated, run inside `withRoomLock`, guard `mode === "king"`, write an audit entry, then `broadcastState`):
  - `admin_reset_table {roomCode}` — clears `kingRotationScheduled`, zeros `kingStreak`; if both seats filled → `resetMatch` + coin toss + deal after 3500ms (mirrors `new_match`), else falls back to the waiting screen. The challenger queue is preserved.
  - `admin_remove_from_queue {roomCode, socketId}` — `removeChallenger`.
  - `admin_set_next_challenger {roomCode, socketId}` — `setNextChallenger`.
- `new_match` is a no-op when `state.mode === "king"` (rotation is automatic; manual rematch would conflict).
- Client: `useSocket.tsx` exposes `adminResetTable` / `adminRemoveFromQueue` / `adminSetNextChallenger` via `adminCall` (no token in payload; authorized by the unlocked admin socket).
- UI (`Room.tsx`): the queue panel shows the Current King (seat with `kingStreak > 0`, with 👑×N streak) and the queue. Buttons renamed for clarity: "Join as Challenger", "Leave Queue (#n)", "Watch Table link". Admin-only controls (behind `isAdmin`): per-queue-entry Remove (✕) and Set-next (↑next), a Reset Table button on the queue panel, and a Reset Table button on the game-over screen.

## KotT losing-player post-match flow

- After a KotT match ends, the **winner stays King** and the **loser** gets explicit choices on the game-over screen instead of being stranded: Rejoin Queue, Back to KotT Lobby (step down to spectate), and Leave Table (home). No challenger queued → winner sees "You are King — waiting for a challenger"; spectators see a King-waiting view.
- Socket event `kott_step_down {roomCode, rejoin}` (`socket.ts`, runs in `withRoomLock`): demotes the caller to spectator + vacates the seat, keeps `phase=game_over` (so the queue→`promoteNextChallenger` null-seat branch still crowns a fresh challenger). If `rejoin=true` it also `addChallenger` + `scheduleKingNextMatch`.
- **Server is the sole authority on who may step down.** Pure helper `canKottStepDown(state, socketId)` (`engine.ts`) authorizes ONLY the losing seat: requires `mode=king`, `phase=game_over`, caller seated, BOTH seats present, non-tied score, and caller seat === lower-score seat. Returns `{ok, loserSeat}` or `{ok:false, error}`. This blocks a winner from vacating their own seat (which would let the rotation crown the loser and bump their streak — a KotT integrity break) and blocks non-seated griefers. The client merely hides the buttons for non-losers (`iLost` gate in `Room.tsx`).
- Client: `kottStepDown(code, rejoin)` in `useSocket.tsx`; handlers + game-over overlay branches (winner / loser / spectator) in `Room.tsx` (testids: `kott-king-waiting`, `kott-loser-prompt`, `button-kott-rejoin-queue`, `button-kott-back-to-lobby`, `button-leave-gameover`). Final game-over button relabeled "Leave Table" in KotT mode. Links stay token-free.
- Engine tests: `artifacts/api-server/src/game/__tests__/kott-loser-flow.test.mts` (run via the spades-game `tsx` binary) cover the loser happy path (single rotation/streak bump) plus guard rejections (winner / non-seated / mid-match / tie / quick-mode).

## Bidding order (coin toss + alternation)

- Coin toss happens ONCE per match (server-side `performCoinToss`, fired by `start_game`).
- The coin toss WINNER bids SECOND in Round 1. The LOSER bids FIRST.
- After Round 1, bidding order alternates every round — implemented by `getFirstBidderForRound(state, roundNumber)` (odd round → `firstBidderRound1`; even → opposite seat). `startRound` uses this for `currentBidder`.
- `GameState` carries `coinFlipWinner` and `firstBidderRound1` (both `0 | 1 | null`); both are sent to player and spectator sanitized views.
- `phase: "coin_toss"` is broadcast for ~3.5s before Round 1 deal so all 3 roles see the result with an overlay (`coin-toss-overlay` testid).
- `resetMatch` (New Match button) clears coin state so the next match re-flips.

## Turn timer (currently OFF by default)

- As of the post–June 1 prep window, **no room type arms a turn timer**. Quick Match and KotT were already untimed; tournament match rooms also now set `turnTimeoutMs = null` (single line in `socket.ts` `createMatchRoomAndAssign`, with the `TOURNAMENT_TURN_TIMEOUT_MS = 30_000` constant retained above so re-enabling is a one-line swap).
- `armTurnTimer` early-returns when `turnTimeoutMs` is null/0 (existing guard). No auto-bid / auto-play fires.
- Host pause/resume/reset admin tools remain functional — they're no-ops on rooms without a timer armed, which is the expected behavior.
- Deferred (post-June-1) — per-room "Turn Timer" dropdown (Off / 30 / 60 / 90), tournament-create selector defaulting to 60, 10-second-remaining client warning, expanded auto-action policy. Plan in conversation history; do NOT ship before the June 1 event.

## Disconnect grace, auto-forfeit & reconnect self-heal

- When a seated tournament-match player disconnects, `scheduleAutoForfeit` (socket.ts) arms a **5-minute** grace timer (`TOURNAMENT_AUTO_FORFEIT_MS = 300_000`) and immediately emits `tournament_player_disconnected` to the `tournament:${code}` room. The Tournament page shows a host-only toast (`tournamentNotice` in useSocket); other roles ignore it.
- If the player reconnects within the window, the timer is cancelled (`cancelAutoForfeit`). If it fires: when the match `isPaused`, the forfeit is **deferred** (re-arms with `notify=false`) so the host can pause to hold a disconnected player's slot indefinitely; otherwise the match auto-forfeits so the bracket keeps moving.
- **Reconnect self-heal (client):** a player's cached room code can go stale after a round ends (old room cleaned up → server throws "Room not found"). On that error, Room.tsx routes to `/tournament/<code>` (looked up via `spades_room_tournament_<roomCode>`) instead of dumping to `/`. The tournament page re-subscribes and the server re-emits `match_assigned` from the still-live `pendingAssignment`, landing the player back in their CURRENT match. The player reconnect token is preserved on stale-room/retryable errors and only cleared on a genuine seat/token rejection.
- The reconnecting screen also shows a **Host tools** shortcut when this browser holds `spades_tournament_token_<code>`, so a dropped host never loses access to pause/forfeit/remake.

## Gotchas

- Always restart the API Server workflow after backend changes; the frontend is hot-reloaded by Vite.
- The `/socket.io` path must remain in `artifacts/api-server/.replit-artifact/artifact.toml` `paths` array or the WebSocket proxy will silently drop connections.
- Room state is lost on server restart (in-memory only).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
