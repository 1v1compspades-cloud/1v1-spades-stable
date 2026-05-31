import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { logger } from "../lib/logger.js";
import {
  createRoom,
  joinRoom,
  getRoom,
  updateRoom,
  startRound,
  placeBid,
  playCard,
  pickAutoBid,
  pickAutoPlayCard,
  removePlayerFromRoom,
  getRoomBySocketId,
  reconnectPlayer,
  restoreRoom,
  resetMatch,
  resetRoom,
  setPlayerReady,
  addSpectator,
  reconnectSpectator,
  performCoinToss,
  addChallenger,
  removeChallenger,
  promoteNextChallenger,
  getAllRooms,
  cleanupRoom,
  type GameState,
  type PlayCardResult,
} from "./engine.js";
import {
  withRoomLock,
  commit,
  clearLastHashFor,
  issueReconnectToken,
  validateReconnectToken,
  deleteReconnectTokensForRoom,
  loadAllActiveRooms,
  expireStaleRoomStates,
} from "./persistence.js";
import type { Card } from "./deck.js";
import {
  createTournament as createTournamentEntity,
  joinTournament as joinTournamentEntity,
  leaveTournament as leaveTournamentEntity,
  startTournament as startTournamentEntity,
  getTournament,
  recordMatchResult,
  attachRoomToMatch,
  findActiveMatchForPlayer,
  reattachPlayerSocket,
  getPlayerSocketIdByName,
  sanitizeTournament,
  setPendingAssignment,
  clearPendingAssignment,
  getAllTournaments,
  deleteTournament,
  requireTournamentHost,
  appendAdminAudit,
  getAdminAuditLog,
  findMatchById,
  detachMatchRoom,
  replacePlayer,
  type Tournament,
  type TournamentMatch,
  type PendingAssignment,
  type AdminAuditEntry,
} from "./tournament.js";
import { deleteRoomState } from "./persistence.js";

// ── Per-socket rate limiting ────────────────────────────────────────────
// Token-bucket-ish: a sliding window of recent timestamps per (socketId, kind).
// Rejects with a friendly error before the action runs. Cleared on disconnect.
const rateBuckets = new Map<string, number[]>();
function rateKey(socketId: string, kind: string): string {
  return `${socketId}:${kind}`;
}
/**
 * Returns true if the call should proceed; false if it exceeded the bucket.
 * `limit` actions per `windowMs` allowed per socket per kind.
 */
function checkRate(socketId: string, kind: string, limit: number, windowMs: number): boolean {
  const key = rateKey(socketId, kind);
  const now = Date.now();
  const arr = rateBuckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    rateBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return true;
}
// ── Visitor counters (in-memory, reset on server restart) ───────────────────
// Cumulative connection metrics since the server last started. Edge-only:
// nothing here feeds the game engine — it's purely observational, surfaced via
// GET /api/admin/stats. "Over the last reset" = since the process started.
let totalConnectionsSinceStart = 0;
const uniqueVisitorIps = new Set<string>();
let peakConcurrentSockets = 0;

function clientIpFromSocket(socket: Socket): string {
  const fwd = socket.handshake.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.trim();
  return socket.handshake.address || "unknown";
}

export function getConnectionStats(): {
  totalConnectionsSinceStart: number;
  uniqueVisitors: number;
  peakConcurrentSockets: number;
} {
  return {
    totalConnectionsSinceStart,
    uniqueVisitors: uniqueVisitorIps.size,
    peakConcurrentSockets,
  };
}

function clearRateForSocket(socketId: string): void {
  for (const k of Array.from(rateBuckets.keys())) {
    if (k.startsWith(`${socketId}:`)) rateBuckets.delete(k);
  }
}

// ── Stale entity sweeper ────────────────────────────────────────────────
// Removes rooms idle for > 30min in non-active phases, and tournaments
// that have been complete for > 1h or stalled in lobby for > 24h.
const STALE_ROOM_IDLE_MS = 30 * 60 * 1000;
const STALE_TOURNEY_COMPLETE_MS = 60 * 60 * 1000;
const STALE_TOURNEY_LOBBY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweepStaleEntities(): void {
  const now = Date.now();
  // Rooms: only sweep rooms in waiting/game_over (don't kill live matches).
  let droppedRooms = 0;
  for (const r of getAllRooms()) {
    if (r.phase !== "waiting" && r.phase !== "game_over") continue;
    const lastActive = Math.max(r.lastActiveAt[0] ?? 0, r.lastActiveAt[1] ?? 0);
    if (now - lastActive > STALE_ROOM_IDLE_MS) {
      cleanupRoom(r.roomCode);
      droppedRooms++;
    }
  }
  // Tournaments: clear long-complete + stalled-lobby.
  let droppedTourneys = 0;
  for (const t of getAllTournaments()) {
    if (t.status === "complete" && now - (t.completedAt ?? t.createdAt) > STALE_TOURNEY_COMPLETE_MS) {
      deleteTournament(t.code);
      droppedTourneys++;
    } else if (t.status === "lobby" && now - t.createdAt > STALE_TOURNEY_LOBBY_MS) {
      deleteTournament(t.code);
      droppedTourneys++;
    }
  }
  if (droppedRooms || droppedTourneys) {
    logger.info({ droppedRooms, droppedTourneys }, "Swept stale entities");
  }
}
let sweepHandle: NodeJS.Timeout | null = null;

function sanitizeStateForPlayer(
  state: GameState,
  playerIndex: 0 | 1
): Record<string, unknown> {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  return {
    roomCode: state.roomCode,
    phase: state.phase,
    players: state.players,
    hand: state.hands[playerIndex],
    opponentHandSize: state.hands[opponentIndex].length,
    handSizes: [state.hands[0].length, state.hands[1].length],
    bids: state.bids,
    currentBidder: state.currentBidder,
    tricks: state.tricks,
    currentTrick: state.currentTrick,
    leadPlayerIndex: state.leadPlayerIndex,
    currentTurnIndex: state.currentTurnIndex,
    spadesBroken: state.spadesBroken,
    scores: state.scores,
    bags: state.bags,
    roundHistory: state.roundHistory,
    roundNumber: state.roundNumber,
    trickLeader: state.trickLeader,
    matchTarget: state.matchTarget,
    tiebreakerActive: state.tiebreakerActive,
    tiebreakerRound: state.tiebreakerRound,
    spectatorCount: state.spectators.length,
    isSpectator: false,
    matchLabel: state.matchLabel,
    lastCardPlayed: state.lastCardPlayed,
    lastCompletedTrick: state.lastCompletedTrick,
    coinFlipWinner: state.coinFlipWinner,
    firstBidderRound1: state.firstBidderRound1,
    lastActiveAt: state.lastActiveAt,
    ready: state.ready,
    mode: state.mode,
    challengerQueue: state.challengerQueue.map((c) => ({ id: c.id, name: c.name })),
    kingStreak: state.kingStreak,
    tournamentRef: state.tournamentRef,
    turnTimeoutMs: state.turnTimeoutMs ?? null,
    turnDeadline: state.turnDeadline ?? null,
    isPaused: state.isPaused ?? false,
  };
}

function sanitizeStateForSpectator(state: GameState): Record<string, unknown> {
  return {
    roomCode: state.roomCode,
    phase: state.phase,
    players: state.players,
    hand: [],
    opponentHandSize: 0,
    handSizes: [state.hands[0].length, state.hands[1].length],
    bids: state.bids,
    currentBidder: state.currentBidder,
    tricks: state.tricks,
    currentTrick: state.currentTrick,
    leadPlayerIndex: state.leadPlayerIndex,
    currentTurnIndex: state.currentTurnIndex,
    spadesBroken: state.spadesBroken,
    scores: state.scores,
    bags: state.bags,
    roundHistory: state.roundHistory,
    roundNumber: state.roundNumber,
    trickLeader: state.trickLeader,
    matchTarget: state.matchTarget,
    tiebreakerActive: state.tiebreakerActive,
    tiebreakerRound: state.tiebreakerRound,
    spectatorCount: state.spectators.length,
    isSpectator: true,
    matchLabel: state.matchLabel,
    lastCardPlayed: state.lastCardPlayed,
    lastCompletedTrick: state.lastCompletedTrick,
    coinFlipWinner: state.coinFlipWinner,
    firstBidderRound1: state.firstBidderRound1,
    lastActiveAt: state.lastActiveAt,
    ready: state.ready,
    mode: state.mode,
    challengerQueue: state.challengerQueue.map((c) => ({ id: c.id, name: c.name })),
    kingStreak: state.kingStreak,
    tournamentRef: state.tournamentRef,
    turnTimeoutMs: state.turnTimeoutMs ?? null,
    turnDeadline: state.turnDeadline ?? null,
    isPaused: state.isPaused ?? false,
  };
}

// ── Turn timers (tournament rooms only) ─────────────────────────────────────
// Per-turn soft clock: when a tournament room's actor (bidder or card-player)
// is idle past `turnTimeoutMs`, the server auto-bids / auto-plays for them.
// Quick Match and KotT rooms set turnTimeoutMs = null and never arm a timer.

const TOURNAMENT_TURN_TIMEOUT_MS = 30_000;
const TOURNAMENT_AUTO_FORFEIT_MS = 300_000; // 5-min disconnect grace before auto-forfeit
const turnTimers = new Map<string, NodeJS.Timeout>();

function clearTurnTimer(roomCode: string): void {
  const h = turnTimers.get(roomCode);
  if (h) {
    clearTimeout(h);
    turnTimers.delete(roomCode);
  }
}

/**
 * Arm (or rearm) the turn timer for a tournament-linked room. MUTATES
 * `state.turnDeadline` so callers should `armTurnTimer` BEFORE calling
 * `broadcastState` so clients receive the new deadline in one push.
 *
 * No-op when `state.turnTimeoutMs` is null/0 (non-tournament rooms) or
 * when there's no current actor (animation / round_over / game_over).
 */
function armTurnTimer(io: SocketIOServer, state: GameState): void {
  clearTurnTimer(state.roomCode);
  // Host-paused match: do not arm a timer. turnDeadline cleared so clients
  // can render "Paused" without a stale countdown.
  if (state.isPaused) {
    state.turnDeadline = null;
    return;
  }
  const budget = state.turnTimeoutMs;
  if (!budget || budget <= 0) {
    state.turnDeadline = null;
    return;
  }
  const actor: 0 | 1 | null =
    state.phase === "bidding" ? state.currentBidder :
    state.phase === "playing" ? state.currentTurnIndex :
    null;
  if (actor === null) {
    state.turnDeadline = null;
    return;
  }
  const deadline = Date.now() + budget;
  state.turnDeadline = deadline;

  const handle = setTimeout(() => {
    turnTimers.delete(state.roomCode);
    try {
      const cur = getRoom(state.roomCode);
      if (!cur) return;
      // Bail if a real action moved the game on — the deadline marker is the
      // authoritative "this scheduled callback is still relevant" check.
      if (cur.turnDeadline !== deadline) return;
      if (cur.phase === "bidding" && cur.currentBidder === actor) {
        autoBidFor(io, cur, actor);
      } else if (cur.phase === "playing" && cur.currentTurnIndex === actor) {
        autoPlayFor(io, cur, actor);
      }
    } catch (err) {
      logger.error({ err, roomCode: state.roomCode }, "Turn timer auto-action failed");
    }
  }, budget);
  turnTimers.set(state.roomCode, handle);
}

function autoBidFor(io: SocketIOServer, state: GameState, playerIndex: 0 | 1): void {
  void withRoomLock(state.roomCode, async () => {
    // Re-read inside the lock — the snapshot passed in could be stale.
    const cur = getRoom(state.roomCode);
    if (!cur || cur.phase !== "bidding" || cur.currentBidder !== playerIndex) return;
    const amount = pickAutoBid(cur, playerIndex);
    try {
      const { state: newState, bothBid } = placeBid(cur, playerIndex, amount);
      armTurnTimer(io, newState);
      await commit(newState, {
        action: "bid_placed",
        actorSeat: playerIndex,
        payload: { amount, auto: true, bothBid },
      });
      io.to(state.roomCode).emit("turn_auto_action", {
        playerIndex, kind: "bid", amount,
      });
      broadcastState(io, newState);
      for (let i = 0; i < 2; i++) {
        const p = newState.players[i];
        if (p) io.to(p.socketId).emit("bid_placed", { playerIndex, amount, bothBid });
      }
    } catch (err) {
      logger.error({ err, roomCode: state.roomCode, playerIndex }, "Auto-bid failed");
    }
  });
}

function autoPlayFor(io: SocketIOServer, state: GameState, playerIndex: 0 | 1): void {
  void withRoomLock(state.roomCode, async () => {
    const cur = getRoom(state.roomCode);
    if (!cur || cur.phase !== "playing" || cur.currentTurnIndex !== playerIndex) return;
    const card = pickAutoPlayCard(cur, playerIndex);
    if (!card) return;
    try {
      const result = playCard(cur, playerIndex, card);
      io.to(state.roomCode).emit("turn_auto_action", {
        playerIndex, kind: "play", card,
      });
      await handlePlayResult(io, state.roomCode, cur, result, playerIndex, true);
    } catch (err) {
      logger.error({ err, roomCode: state.roomCode, playerIndex }, "Auto-play failed");
    }
  });
}

/**
 * Shared post-play pipeline used by both the real `play_card` handler and
 * `autoPlayFor`. Owns the trick-complete two-phase reveal, round_over /
 * game_over emits, KotT rotation, and tournament-bracket advancement.
 */
async function handlePlayResult(
  io: SocketIOServer,
  roomCode: string,
  preState: GameState,
  result: PlayCardResult,
  actorSeat: 0 | 1,
  isAuto: boolean,
): Promise<void> {
  if (result.trickComplete && result.intermediateState) {
    const inter = result.intermediateState;
    inter.turnDeadline = null;
    clearTurnTimer(roomCode);
    await commit(inter, {
      action: "trick_completed",
      actorSeat,
      payload: { winner: result.trickWinner, auto: isAuto },
    });
    broadcastState(io, inter);
    io.to(roomCode).emit("trick_complete", {
      winner: result.trickWinner,
      tricks: inter.tricks,
    });

    // Schedule the second phase under the same per-room lock so it can't
    // interleave with another action that arrives during the 700ms delay.
    setTimeout(() => {
      void withRoomLock(roomCode, async () => {
        try {
          const current = getRoom(roomCode);
          if (!current) return;
          // `result.state` was computed BEFORE the 700ms reveal. Any changes
          // that happened during the delay (disconnect/reconnect/spectator
          // join+leave/queue mutations) live on `current`. Overlay the
          // engine's gameplay deltas onto current's transient roster so we
          // don't clobber them.
          const merged: GameState = {
            ...result.state,
            players: current.players,
            spectators: current.spectators,
            challengerQueue: current.challengerQueue,
            ready: current.ready,
            turnTimeoutMs: current.turnTimeoutMs,
            // Reconnect during the reveal bumps lastActiveAt on `current`;
            // don't regress it from the stale snapshot.
            lastActiveAt: current.lastActiveAt,
            // Admin pause toggled during the 700ms reveal lives on `current`;
            // carrying it forward keeps the pause intact and prevents
            // armTurnTimer from re-arming. Without this, host can pause
            // mid-trick and have it silently undone on trick resolve.
            isPaused: current.isPaused,
          };
          armTurnTimer(io, merged);
          const action =
            merged.phase === "game_over"
              ? "match_completed"
              : result.roundComplete
              ? "round_completed"
              : "trick_advanced";
          await commit(merged, {
            action,
            actorSeat,
            payload: {
              roundComplete: result.roundComplete,
              gameOver: merged.phase === "game_over",
              scores: merged.scores,
            },
          });
          broadcastState(io, merged);

          if (result.roundComplete) {
            io.to(roomCode).emit("round_over", {
              scores: merged.scores,
              bags: merged.bags,
              tricks: merged.tricks,
              bids: [preState.bids[0], preState.bids[1]],
              roundHistory: merged.roundHistory,
              phase: merged.phase,
            });
          }
          if (merged.phase === "game_over" && merged.mode === "king" && merged.challengerQueue.length > 0) {
            scheduleKingNextMatch(io, roomCode);
          }
          if (merged.phase === "game_over" && merged.tournamentRef) {
            void advanceTournamentOnGameOver(io, merged);
          }
        } catch (err) {
          logger.error({ err, roomCode }, "handlePlayResult post-delay failed");
        }
      });
    }, 700);
  } else {
    result.state.turnTimeoutMs = preState.turnTimeoutMs;
    armTurnTimer(io, result.state);
    await commit(result.state, {
      action: "card_played",
      actorSeat,
      payload: { auto: isAuto },
    });
    broadcastState(io, result.state);
  }
}

// ── Tournament auto-forfeit on disconnect ───────────────────────────────────
// When a seated tournament-match player disconnects, give them a 5-minute
// grace window to reconnect. The tournament host is notified immediately so
// they can intervene. If the window expires the match is forfeited so the
// bracket can keep advancing — UNLESS the host has paused the match, in which
// case the slot is held open until the host resumes or forfeits manually.

const disconnectForfeitTimers = new Map<string, NodeJS.Timeout>();

function scheduleAutoForfeit(
  io: SocketIOServer,
  roomCode: string,
  playerIndex: 0 | 1,
  notify = true,
): void {
  const key = `${roomCode}:${playerIndex}`;
  const existing = disconnectForfeitTimers.get(key);
  if (existing) clearTimeout(existing);
  // Notify the tournament host immediately so they can act during the grace
  // window (pause to hold the slot, remake the room, or forfeit manually).
  // Skipped on internal re-arms (paused-match deferrals) to avoid spamming.
  if (notify) {
    try {
      const cur = getRoom(roomCode);
      const tref = cur?.tournamentRef;
      if (cur && tref) {
        io.to(`tournament:${tref.code}`).emit("tournament_player_disconnected", {
          tournamentCode: tref.code,
          matchId: tref.matchId,
          roomCode,
          playerIndex,
          playerName: cur.players[playerIndex]?.name ?? null,
          graceMs: TOURNAMENT_AUTO_FORFEIT_MS,
        });
      }
    } catch (err) {
      logger.error({ err, roomCode, playerIndex }, "Disconnect notice emit failed");
    }
  }
  const handle = setTimeout(() => {
    disconnectForfeitTimers.delete(key);
    try {
      const cur = getRoom(roomCode);
      if (!cur) return;
      if (cur.players[playerIndex] !== null) return; // reconnected
      if (cur.phase === "game_over") return;
      if (!cur.tournamentRef) return;
      if (cur.isPaused) {
        // Host paused the match to hold the slot open for the disconnected
        // player. Defer the forfeit and keep waiting — re-arm (without a fresh
        // host notice) so we re-check after another grace window. The host
        // resumes or forfeits manually when ready.
        scheduleAutoForfeit(io, roomCode, playerIndex, false);
        return;
      }
      logger.info({ roomCode, playerIndex }, "Auto-forfeiting disconnected tournament player");
      forfeitTournamentMatch(io, roomCode, playerIndex, "disconnect");
    } catch (err) {
      logger.error({ err, roomCode, playerIndex }, "Auto-forfeit fire failed");
    }
  }, TOURNAMENT_AUTO_FORFEIT_MS);
  disconnectForfeitTimers.set(key, handle);
}

function cancelAutoForfeit(roomCode: string, playerIndex: 0 | 1): void {
  const key = `${roomCode}:${playerIndex}`;
  const h = disconnectForfeitTimers.get(key);
  if (h) {
    clearTimeout(h);
    disconnectForfeitTimers.delete(key);
  }
}

/**
 * Mark a tournament match as forfeited by `forfeitSeat`. The opposing side
 * is recorded as winner at `matchTarget`, the game flips to game_over, and
 * the bracket advancement pipeline runs as if the match had naturally ended.
 * Idempotent: no-op if already past game_over or not a tournament room.
 */
function forfeitTournamentMatch(
  io: SocketIOServer,
  roomCode: string,
  forfeitSeat: 0 | 1,
  reason: "disconnect" | "host_forced",
): Promise<void> {
  return withRoomLock(roomCode, async () => {
    const state = getRoom(roomCode);
    if (!state) return;
    if (!state.tournamentRef) return;
    if (state.phase === "game_over") return;

    clearTurnTimer(roomCode);
    const winnerSeat: 0 | 1 = forfeitSeat === 0 ? 1 : 0;
    const finalScores: [number, number] = [state.scores[0], state.scores[1]];
    finalScores[winnerSeat] = Math.max(finalScores[winnerSeat], state.matchTarget);
    if (finalScores[winnerSeat] <= finalScores[forfeitSeat]) {
      finalScores[winnerSeat] = finalScores[forfeitSeat] + 1;
    }

    const forfeitedName = state.players[forfeitSeat]?.name ?? null;
    const winnerName = state.players[winnerSeat]?.name ?? null;
    const finalState: GameState = {
      ...state,
      phase: "game_over",
      scores: finalScores,
      currentBidder: null,
      currentTurnIndex: null,
      turnDeadline: null,
    };
    await commit(finalState, {
      action: "forfeit",
      actorSeat: forfeitSeat,
      payload: { reason, forfeitedName, winnerName, finalScores },
    });
    io.to(roomCode).emit("match_forfeit", {
      roomCode,
      forfeitSeat,
      forfeitedName,
      winnerName,
      reason,
    });
    broadcastState(io, finalState);
    await advanceTournamentOnGameOver(io, finalState);
  });
}

/**
 * Shared body for `admin_force_forfeit` (canonical) and
 * `tournament_force_forfeit` (legacy alias). Validates host token,
 * delegates to `forfeitTournamentMatch`, and appends an audit row.
 */
async function runAdminForceForfeit(
  io: SocketIOServer,
  data: { code: string; matchId: string; forfeitSeat: "A" | "B"; token?: string },
  callback?: (res: { ok: boolean; error?: string }) => void,
): Promise<void> {
  try {
    const code = (data.code || "").toUpperCase().trim();
    const t = getTournament(code);
    if (!t) throw new Error("Tournament not found");
    const host = requireTournamentHost(t, data.token);
    const match = findMatchById(t, data.matchId);
    if (!match) throw new Error("Match not found");
    if (!match.roomCode) throw new Error("Match has not started yet");
    if (match.winner) throw new Error("Match already resolved");
    const roomCode = match.roomCode;
    const seatIdx: 0 | 1 = data.forfeitSeat === "A" ? 0 : 1;
    const forfeitedName =
      data.forfeitSeat === "A"
        ? match.playerA?.name ?? null
        : match.playerB?.name ?? null;
    // Await — so the callback honestly reports whether the forfeit
    // landed (room still exists, lock acquired, commit succeeded) before
    // we audit + ack. Otherwise a stale room could no-op and we'd still
    // tell the host "done".
    await forfeitTournamentMatch(io, roomCode, seatIdx, "host_forced");
    // Re-check post-await: the match should now have a winner.
    if (!match.winner) {
      throw new Error("Forfeit did not advance the match — room may have been removed");
    }
    appendAdminAudit(t, {
      action: "force_forfeit",
      actorName: host.name,
      matchId: match.id,
      roomCode,
      payload: { forfeitSeat: data.forfeitSeat, forfeitedName },
    });
    io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
    callback?.({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    callback?.({ ok: false, error: msg });
  }
}

/**
 * Build the host-only dashboard snapshot. Returns one entry per bracket
 * match including live game-state fields (scores, current turn, paused,
 * last activity) and per-seat connection status.
 *
 * Caller MUST gate this with `requireTournamentHost` — this function does
 * NOT itself check permissions because it has no token argument.
 */
function buildAdminDashboard(
  io: SocketIOServer,
  t: Tournament,
): {
  code: string;
  name: string;
  status: Tournament["status"];
  matches: Array<{
    matchId: string;
    round: number;
    position: number;
    roomCode: string | null;
    playerA: { name: string; connected: boolean } | null;
    playerB: { name: string; connected: boolean } | null;
    winner: "A" | "B" | null;
    winnerName: string | null;
    live: {
      phase: string;
      scores: [number, number];
      roundNumber: number;
      currentTurnIndex: 0 | 1 | null;
      currentBidder: 0 | 1 | null;
      turnDeadline: number | null;
      isPaused: boolean;
      lastActiveAt: [number, number] | null;
    } | null;
  }>;
} {
  const matches = t.rounds.flat().map((m) => {
    const sidA = m.playerA ? getPlayerSocketIdByName(t, m.playerA.name) : null;
    const sidB = m.playerB ? getPlayerSocketIdByName(t, m.playerB.name) : null;
    const connected = (sid: string | null): boolean =>
      !!sid && !!io.sockets.sockets.get(sid)?.connected;
    const live = m.roomCode ? getRoom(m.roomCode) : null;
    return {
      matchId: m.id,
      round: m.round,
      position: m.position,
      roomCode: m.roomCode,
      playerA: m.playerA
        ? { name: m.playerA.name, connected: connected(sidA) }
        : null,
      playerB: m.playerB
        ? { name: m.playerB.name, connected: connected(sidB) }
        : null,
      winner: m.winner,
      winnerName: m.winnerName,
      live: live
        ? {
            phase: live.phase,
            scores: live.scores,
            roundNumber: live.roundNumber,
            currentTurnIndex: live.currentTurnIndex,
            currentBidder: live.currentBidder,
            turnDeadline: live.turnDeadline ?? null,
            isPaused: live.isPaused ?? false,
            lastActiveAt: live.lastActiveAt ?? null,
          }
        : null,
    };
  });
  return {
    code: t.code,
    name: t.name,
    status: t.status,
    matches,
  };
}

/** Duration of the visual shuffle + deal animation between phases. */
const SHUFFLE_ANIMATION_MS = 3100;

/**
 * Reveal a freshly-dealt round in two steps:
 *   1. Broadcast as `phase: "shuffling"` so clients play the shuffle/deal
 *      animation while hiding the new hand.
 *   2. After SHUFFLE_ANIMATION_MS, broadcast the real `phase: "bidding"`
 *      state and emit `round_started`.
 *
 * Bids placed during step (1) are rejected by the socket handler's phase
 * guard, so this is safe even though the dealt state has currentBidder set.
 */
async function dealWithShuffleAnimation(
  io: SocketIOServer,
  roomCode: string,
  dealt: GameState
): Promise<void> {
  const shuffling: GameState = { ...dealt, phase: "shuffling" };
  await commit(shuffling, {
    action: "cards_dealt",
    payload: { roundNumber: dealt.roundNumber },
  });
  broadcastState(io, shuffling);

  setTimeout(() => {
    void withRoomLock(roomCode, async () => {
      try {
        const current = getRoom(roomCode);
        if (!current || current.phase !== "shuffling") return;
        const ready: GameState = { ...current, phase: "bidding" };
        armTurnTimer(io, ready);
        await commit(ready, {
          action: "bidding_started",
          payload: { roundNumber: ready.roundNumber, firstBidder: ready.currentBidder },
        });
        broadcastState(io, ready);
        const firstBidder = ready.currentBidder;
        for (let i = 0; i < 2; i++) {
          const p = ready.players[i];
          if (p) {
            io.to(p.socketId).emit("round_started", {
              roundNumber: ready.roundNumber,
              yourBidTurn: i === firstBidder,
            });
          }
        }
      } catch (err: unknown) {
        logger.error({ err, roomCode }, "Error transitioning from shuffling to bidding");
      }
    });
  }, SHUFFLE_ANIMATION_MS);
}

/** Delay between game_over and the KotT auto-promotion / next match. */
const KING_NEXT_MATCH_DELAY_MS = 5000;

/**
 * Human-friendly label for a bracket match given its round (1-indexed) and
 * position. Final round → "Finals". Semi → "Semifinal N". Quarter → "Quarterfinal N".
 * Anything earlier falls back to "R{round} M{pos+1}".
 */
function roundLabelForMatch(totalRounds: number, round: number, position: number): string {
  const fromFinal = totalRounds - round; // 0 = final, 1 = semi, 2 = quarter, ...
  if (fromFinal === 0) return "Finals";
  if (fromFinal === 1) return `Semifinal ${position + 1}`;
  if (fromFinal === 2) return `Quarterfinal ${position + 1}`;
  if (fromFinal === 3) return `Round of 16 · M${position + 1}`;
  if (fromFinal === 4) return `Round of 32 · M${position + 1}`;
  return `R${round} M${position + 1}`;
}

/**
 * Tournament: spin up a freshly-seated game room for a bracket match.
 * Looks up both players' current socketIds, creates the room with player A
 * as host, joins player B, records the room code on the match, and emits
 * `match_assigned` to each player's socket so the client can navigate.
 */
async function createMatchRoomAndAssign(
  io: SocketIOServer,
  t: Tournament,
  match: TournamentMatch
): Promise<void> {
  if (!match.playerA || !match.playerB) {
    logger.warn({ code: t.code, matchId: match.id }, "createMatchRoomAndAssign called with incomplete pair");
    return;
  }
  if (match.roomCode) return; // already created

  const sA = getPlayerSocketIdByName(t, match.playerA.name);
  const sB = getPlayerSocketIdByName(t, match.playerB.name);
  if (!sA || !sB) {
    logger.warn(
      { code: t.code, matchId: match.id, sA, sB },
      "Cannot create tournament match room — missing player socketIds"
    );
    return;
  }

  const labelBase = roundLabelForMatch(t.rounds.length, match.round, match.position);
  const label = `${t.name} · ${labelBase}`;

  const room = createRoom(
    match.playerA.name,
    sA,
    t.matchTarget,
    label,
    "quick",
    { code: t.code, matchId: match.id }
  );
  // Turn timer is OFF by default for every room type (Quick, KotT, Tournament).
  // Hosts can still pause/resume/reset via admin tools; auto-play on idle is
  // disabled until the per-room "Turn Timer" setting ships (post-June-1).
  // The TOURNAMENT_TURN_TIMEOUT_MS constant above is retained so re-enabling
  // is a one-line change.
  room.turnTimeoutMs = null;
  // AWAIT the commits inside the lock so `match_assigned` is never emitted
  // before the room is durable + audited. Clients refresh-recovering via
  // pendingAssignment must not see a room code the DB doesn't yet know about.
  await withRoomLock(room.roomCode, async () => {
    await commit(room, {
      action: "room_created",
      payload: { mode: "quick", tournamentMatch: match.id, host: match.playerA?.name, label },
    });
    const joined = joinRoom(room.roomCode, match.playerB!.name, sB);
    await commit(joined.state, {
      action: "player_joined",
      actorSeat: 1,
      payload: { name: match.playerB?.name, tournamentMatch: match.id },
    });
  });
  attachRoomToMatch(t.code, match.id, room.roomCode);

  // Make both player sockets join the game-room channel so they get
  // game_state broadcasts immediately.
  for (const sid of [sA, sB]) {
    const sock = io.sockets.sockets.get(sid);
    if (sock) sock.join(room.roomCode);
  }

  // Record + emit assignments. Store as pending so a refresh on the tournament
  // page can re-deliver them via subscribe_tournament.
  const pendingA: PendingAssignment = {
    matchId: match.id,
    roomCode: room.roomCode,
    playerIndex: 0,
    matchLabel: label,
    opponentName: match.playerB.name,
  };
  const pendingB: PendingAssignment = {
    matchId: match.id,
    roomCode: room.roomCode,
    playerIndex: 1,
    matchLabel: label,
    opponentName: match.playerA.name,
  };
  setPendingAssignment(t, match.playerA.name, pendingA);
  setPendingAssignment(t, match.playerB.name, pendingB);

  io.to(sA).emit("match_assigned", { tournamentCode: t.code, ...pendingA });
  io.to(sB).emit("match_assigned", { tournamentCode: t.code, ...pendingB });

  logger.info(
    { tournament: t.code, match: match.id, room: room.roomCode, a: match.playerA.name, b: match.playerB.name },
    "Tournament match room created"
  );
}

/**
 * Tournament: called from the playCard handler when a tournament-linked
 * game room hits game_over. Advances the bracket, eliminates the loser,
 * creates next-round rooms when both feeder matches resolve, and
 * announces completion when the final lands.
 */
async function advanceTournamentOnGameOver(io: SocketIOServer, state: GameState): Promise<void> {
  if (!state.tournamentRef) return;
  const { code, matchId } = state.tournamentRef;
  const t = getTournament(code);
  if (!t) {
    logger.warn({ code }, "Game ended with tournamentRef but tournament missing");
    return;
  }
  const [s0, s1] = state.scores;
  if (s0 === s1) {
    // Spades engine prevents true ties at game_over, but be defensive.
    logger.warn({ code, matchId, s0, s1 }, "Tournament match ended in a tie — cannot advance");
    return;
  }
  const winnerSeat: "A" | "B" = s0 > s1 ? "A" : "B";

  const resolution = await recordMatchResult(code, matchId, winnerSeat, {
    finalScores: [s0, s1],
  });
  if (resolution.kind === "rejected") {
    logger.error(
      { code, matchId, reason: resolution.reason, message: resolution.message },
      "Failed to record tournament match result — bracket not advanced",
    );
    return;
  }
  if (resolution.kind === "replay") {
    // Same (matchId, winner) already recorded in this process — don't
    // double-emit eliminated/state/complete or re-create rooms.
    logger.info({ code, matchId }, "Ignoring duplicate game_over for already-recorded tournament match");
    return;
  }
  const effect = resolution.effect;

  // Clear pending assignments for BOTH players of the resolved match —
  // the room they were pointing at is now over.
  const resolvedA = effect.resolvedMatch.playerA?.name;
  const resolvedB = effect.resolvedMatch.playerB?.name;
  if (resolvedA) clearPendingAssignment(effect.tournament, resolvedA);
  if (resolvedB) clearPendingAssignment(effect.tournament, resolvedB);

  // Notify the loser they're out.
  const loserName = effect.loserName;
  if (loserName) {
    const loserSid = getPlayerSocketIdByName(effect.tournament, loserName);
    if (loserSid) {
      io.to(loserSid).emit("tournament_eliminated", {
        tournamentCode: code,
        round: effect.resolvedMatch.round,
        finishedRound: effect.resolvedMatch.round,
      });
    }
  }

  // Broadcast the immediate bracket update (loser eliminated, winner advanced)
  // so subscribers see the resolution right away.
  io.to(`tournament:${code}`).emit("tournament_state", sanitizeTournament(effect.tournament));

  // Spin up rooms for any next-round matches that now have both feeders, then
  // re-broadcast so subscribers observe the new roomCode assignments. The
  // initial broadcast above intentionally fires BEFORE these awaits so the
  // gameplay caller (handlePlayResult) isn't blocked; the second broadcast
  // closes the window where the bracket shows next-round matches without
  // their rooms yet.
  void (async () => {
    for (const next of effect.newlyReadyMatches) {
      await createMatchRoomAndAssign(io, effect.tournament, next);
    }
    if (effect.newlyReadyMatches.length > 0) {
      io.to(`tournament:${code}`).emit("tournament_state", sanitizeTournament(effect.tournament));
    }
  })();

  if (effect.isFinal && effect.championName) {
    io.to(`tournament:${code}`).emit("tournament_complete", {
      tournamentCode: code,
      champion: effect.championName,
    });
    logger.info({ code, champion: effect.championName }, "Tournament complete");
  }
}

/**
 * KotT: at game_over, promote the queue head into the loser's seat and
 * kick off a fresh match (coin toss → deal). No-op if mode != king, the
 * queue is empty, or the scores are tied.
 *
 * Emits `you_are_seated` to the promoted client and `you_are_unseated`
 * to the demoted client so each updates its local role state.
 */
/**
 * Tracks rooms with a KotT rotation already scheduled so we don't stack
 * timers if both the playCard hook and a late `join_queue` race to schedule.
 */
const kingRotationScheduled = new Set<string>();

function scheduleKingNextMatch(io: SocketIOServer, roomCode: string): void {
  if (kingRotationScheduled.has(roomCode)) return;
  kingRotationScheduled.add(roomCode);
  setTimeout(() => {
    kingRotationScheduled.delete(roomCode);
    void withRoomLock(roomCode, async () => {
      try {
        const cur = getRoom(roomCode);
        if (!cur || cur.phase !== "game_over" || cur.mode !== "king") return;
        if (cur.challengerQueue.length === 0) return;

        const result = promoteNextChallenger(roomCode);
        if (!result) return;

        const promotedSock = io.sockets.sockets.get(result.promoted.socketId);
        if (promotedSock) {
          promotedSock.join(roomCode);
        } else {
          logger.warn({ roomCode, socketId: result.promoted.socketId }, "Promoted challenger disconnected; aborting rotation");
          const rolled = getRoom(roomCode);
          if (rolled) {
            rolled.players[result.promoted.playerIndex] = null;
            await commit(rolled, {
              action: "king_rotation_aborted",
              payload: { reason: "promoted_socket_gone" },
            });
            broadcastState(io, rolled);
            if (rolled.challengerQueue.length > 0) {
              scheduleKingNextMatch(io, roomCode);
            }
          }
          return;
        }

        // promoteNextChallenger already wrote result.state to the map; persist + audit it.
        await commit(result.state, {
          action: "king_rotation",
          payload: {
            promoted: { seat: result.promoted.playerIndex, name: result.promoted.name },
            demoted: result.demoted ? { seat: result.demoted.previousIndex } : null,
          },
        });

        io.to(result.promoted.socketId).emit("you_are_seated", {
          roomCode,
          playerIndex: result.promoted.playerIndex,
          name: result.promoted.name,
        });
        if (result.demoted) {
          io.to(result.demoted.socketId).emit("you_are_unseated", {
            roomCode,
            previousIndex: result.demoted.previousIndex,
          });
        }
        broadcastState(io, result.state);

        const tossed = performCoinToss(result.state);
        await commit(tossed, {
          action: "coin_toss",
          payload: { winner: tossed.coinFlipWinner, firstBidder: tossed.firstBidderRound1 },
        });
        broadcastState(io, tossed);

        setTimeout(() => {
          void withRoomLock(roomCode, async () => {
            try {
              const c = getRoom(roomCode);
              if (!c || c.phase !== "coin_toss") return;
              if (!c.players[0] || !c.players[1]) {
                logger.warn({ roomCode }, "Seat went empty during KotT coin toss; reverting to game_over");
                c.phase = "game_over";
                await commit(c, {
                  action: "king_rotation_aborted",
                  payload: { reason: "seat_empty_during_coin_toss" },
                });
                broadcastState(io, c);
                if (c.challengerQueue.length > 0) {
                  scheduleKingNextMatch(io, roomCode);
                }
                return;
              }
              const dealt = startRound(c);
              await dealWithShuffleAnimation(io, roomCode, dealt);
            } catch (err: unknown) {
              logger.error({ err, roomCode }, "Error dealing first round of KotT next match");
            }
          });
        }, 3500);
      } catch (err: unknown) {
        logger.error({ err, roomCode }, "Error scheduling KotT next match");
      }
    });
  }, KING_NEXT_MATCH_DELAY_MS);
}

/**
 * Broadcast game_state to both players AND all spectators.
 * Each gets a view sanitized for their role.
 */
function broadcastState(
  io: SocketIOServer,
  state: GameState
): void {
  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    if (p) {
      io.to(p.socketId).emit("game_state", sanitizeStateForPlayer(state, i as 0 | 1));
    }
  }
  const specView = sanitizeStateForSpectator(state);
  for (const spec of state.spectators) {
    io.to(spec.socketId).emit("game_state", specView);
  }
}

// ── Boot recovery ────────────────────────────────────────────────────────
// After a server restart, the in-memory `rooms` Map is empty but the
// `active_rooms` table still holds the durable state for every live room.
// Reload them so:
//   - Players who refresh / reconnect can land back on their seat
//     (reconnect_player will validate against the rehydrated state).
//   - Turn timers that were mid-flight at shutdown get re-armed, with a
//     2s grace if the original deadline has already passed (so a sleeping
//     player isn't auto-played the instant the server comes back).
//   - TTL-expired rooms get pruned in one pass so we don't rehydrate
//     garbage.
const POST_BOOT_GRACE_MS = 2_000;

export async function rehydrateRoomsOnBoot(io: SocketIOServer): Promise<{
  loaded: number;
  expired: number;
  timersArmed: number;
}> {
  // Drop TTL-expired rows first so we don't rehydrate them just to discard.
  const expired = await expireStaleRoomStates();
  const rows = await loadAllActiveRooms();
  let timersArmed = 0;
  for (const row of rows) {
    try {
      const state = row.state as unknown as GameState;
      if (!state || typeof state !== "object") continue;
      // game_over rooms are kept for the 2h TTL window so spectators can
      // still load the final screen, but they don't need a turn timer.
      restoreRoom(state);
      if (
        state.turnTimeoutMs &&
        state.turnDeadline !== null &&
        (state.phase === "playing" || state.phase === "bidding")
      ) {
        const remaining = (state.turnDeadline ?? 0) - Date.now();
        // Apply the post-boot grace: if the deadline already lapsed, give
        // the actor at least POST_BOOT_GRACE_MS to reconnect before the
        // auto-action fires. We DO this by stretching state.turnTimeoutMs
        // for one cycle, then armTurnTimer re-derives the deadline.
        const originalBudget = state.turnTimeoutMs;
        state.turnTimeoutMs = Math.max(remaining, POST_BOOT_GRACE_MS);
        try {
          armTurnTimer(io, state);
        } finally {
          // Restore the per-room budget so subsequent turns use the normal
          // 30s timeout, not the stretched grace window.
          state.turnTimeoutMs = originalBudget;
        }
        timersArmed++;
      }
    } catch (err) {
      logger.warn({ err, roomCode: row.roomCode }, "rehydrateRoomsOnBoot: skip row");
    }
  }
  logger.info(
    { loaded: rows.length, expired, timersArmed },
    "Rehydrated rooms from active_rooms",
  );
  return { loaded: rows.length, expired, timersArmed };
}

export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  // Start the periodic stale-entity sweep once per process. Idempotent in
  // case setupSocketIO is ever called more than once.
  if (!sweepHandle) {
    sweepHandle = setInterval(sweepStaleEntities, SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive just for the sweeper.
    sweepHandle.unref?.();
  }
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    totalConnectionsSinceStart += 1;
    uniqueVisitorIps.add(clientIpFromSocket(socket));
    const concurrent = io.engine.clientsCount;
    if (concurrent > peakConcurrentSockets) peakConcurrentSockets = concurrent;
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on(
      "create_room",
      async (
        data: { playerName: string; matchTarget?: number; matchLabel?: string; mode?: string },
        callback: (res: { ok: boolean; roomCode?: string; playerIndex?: number; token?: string; error?: string }) => void
      ) => {
        try {
          if (!checkRate(socket.id, "create_room", 5, 30_000)) {
            return callback({ ok: false, error: "Slow down — too many rooms created. Try again in a moment." });
          }
          const rawTarget = Number(data.matchTarget);
          const target = Number.isFinite(rawTarget) && rawTarget > 0 && rawTarget <= 5000
            ? Math.floor(rawTarget)
            : 250;
          const rawLabel = typeof data.matchLabel === "string" ? data.matchLabel.trim() : "";
          const label = rawLabel ? rawLabel.slice(0, 40) : undefined;
          const mode: "quick" | "king" = data.mode === "king" ? "king" : "quick";
          const state = createRoom(data.playerName, socket.id, target, label, mode);
          await withRoomLock(state.roomCode, async () => {
            await commit(state, {
              action: "room_created",
              actorSeat: 0,
              payload: { mode, matchTarget: target, host: data.playerName, label },
            });
          });
          // Issue the seat-0 reconnect token AFTER commit so the row exists if
          // the client immediately tries to reconnect. Token rotation on every
          // create_room of the same code keeps a leaked token from a previous
          // tenant of the same code from carrying over.
          // We only set tokenizedSeats[0]=true once issue+commit BOTH succeed,
          // so reconnect can fail-closed for tokenized seats without locking
          // out rooms where the DB write genuinely failed.
          let token: string | undefined;
          try {
            token = await issueReconnectToken(state.roomCode, 0, data.playerName);
            state.tokenizedSeats = state.tokenizedSeats ?? [false, false];
            state.tokenizedSeats[0] = true;
            await withRoomLock(state.roomCode, async () => {
              await commit(state, { action: "token_issued", actorSeat: 0, payload: { seat: 0 } });
            });
          } catch (err) {
            logger.warn({ err, roomCode: state.roomCode }, "issueReconnectToken failed (create_room)");
          }
          socket.join(state.roomCode);
          (socket.data as { playerName?: string }).playerName = data.playerName;
          logger.info({ roomCode: state.roomCode, playerName: data.playerName, socketId: socket.id }, "Room created");
          callback({ ok: true, roomCode: state.roomCode, playerIndex: 0, token });
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "join_room",
      async (
        data: { roomCode: string; playerName: string },
        callback: (res: { ok: boolean; playerIndex?: number; token?: string; error?: string }) => void
      ) => {
        try {
          if (!checkRate(socket.id, "join_room", 10, 30_000)) {
            return callback({ ok: false, error: "Slow down — too many join attempts." });
          }
          const code = data.roomCode.toUpperCase().trim();
          let result: { state: GameState; playerIndex: number } | null = null;
          let joinErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              // Tournament finals-seating defensive path.
              // `createMatchRoomAndAssign` pre-seats both bracket opponents
              // using their CURRENT socketId at room-creation time. If a
              // player's socket drops/reconnects between that moment and
              // their navigation to /room/<code> (or if the client's
              // stale-room-code guard wiped their cached playerIndex so they
              // fall into the fresh-join branch instead of the reconnect
              // branch), the engine sees the seat already filled and rejects
              // with "Room is full". For tournament rooms only, if the
              // joining name matches a pre-seated slot, treat it as a
              // reconnect: swap the new socketId into the existing seat.
              // Quick Match and KotT rooms are unaffected — they fall
              // through to the normal engine.joinRoom path.
              const pre = getRoom(code);
              if (pre?.tournamentRef) {
                const norm = (s: string) => s.trim().toLowerCase();
                const seat = pre.players.findIndex(
                  (p) => p && norm(p.name) === norm(data.playerName)
                );
                if (seat >= 0) {
                  // Security: if this seat has already been tokenized by a
                  // prior join, refuse to reclaim via join_room (which carries
                  // no token). The client MUST use reconnect_player with the
                  // token they were issued. This closes the bypass where an
                  // attacker who knew the room code + a participant's display
                  // name could hijack a tokenized seat through join_room.
                  if (pre.tokenizedSeats?.[seat as 0 | 1] === true) {
                    joinErr = new Error("Reconnect token required for this seat");
                    return;
                  }
                  // Use the canonical seat name (avoid user-supplied drift in
                  // case/whitespace propagating into audit + token issuance).
                  const canonicalName = pre.players[seat]!.name;
                  const s = reconnectPlayer(code, seat as 0 | 1, socket.id, canonicalName);
                  result = { state: s, playerIndex: seat };
                  data.playerName = canonicalName;
                  await commit(s, {
                    action: "reconnect",
                    actorSeat: seat,
                    payload: { playerName: canonicalName, role: "player", via: "join_room_tournament_reclaim" },
                  });
                  return;
                }
              }
              const r = joinRoom(code, data.playerName, socket.id);
              result = r;
              await commit(r.state, {
                action: "player_joined",
                actorSeat: r.playerIndex,
                payload: { name: data.playerName },
              });
            } catch (e) {
              joinErr = e as Error;
            }
          });
          if (joinErr || !result) throw joinErr ?? new Error("Join failed");
          const { state, playerIndex } = result as { state: GameState; playerIndex: number };
          let token: string | undefined;
          try {
            token = await issueReconnectToken(code, playerIndex as 0 | 1, data.playerName);
            state.tokenizedSeats = state.tokenizedSeats ?? [false, false];
            state.tokenizedSeats[playerIndex as 0 | 1] = true;
            await withRoomLock(code, async () => {
              await commit(state, { action: "token_issued", actorSeat: playerIndex, payload: { seat: playerIndex } });
            });
          } catch (err) {
            logger.warn({ err, roomCode: code }, "issueReconnectToken failed (join_room)");
          }
          socket.join(code);
          (socket.data as { playerName?: string }).playerName = data.playerName;
          logger.info({ roomCode: code, playerName: data.playerName, socketId: socket.id }, "Player joined room");
          callback({ ok: true, playerIndex, token });
          const hostSocket = state.players[0]?.socketId;
          if (hostSocket) {
            io.to(hostSocket).emit("opponent_joined", { playerName: data.playerName });
          }
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on("start_game", (data: { roomCode: string }) => {
      void withRoomLock(data.roomCode, async () => {
        try {
          const state = getRoom(data.roomCode);
          if (!state) return;
          // In tournament match rooms, EITHER seated player can press Start —
          // there is no semantic "host" between the two bracket opponents.
          // (Pre-June-1 bugfix: avoid the perception that "host transferred"
          // when the next-round room's playerIndex-0 sees a Start button no
          // one else does.) In non-tournament rooms, keep the room-host-only
          // gating: playerIndex 0 (creator) controls start.
          const inTournament = !!state.tournamentRef;
          if (inTournament) {
            const callerSeat = state.players.findIndex((p) => p?.socketId === socket.id);
            if (callerSeat < 0) return;
          } else {
            if (state.players[0]?.socketId !== socket.id) return;
          }
          if (!state.players[1]) return;
          if (state.phase !== "waiting") return;
          if (!state.ready[0] || !state.ready[1]) return;

          const tossed = performCoinToss(state);
          await commit(tossed, {
            action: "coin_toss",
            actorSeat: 0,
            payload: { winner: tossed.coinFlipWinner, firstBidder: tossed.firstBidderRound1 },
          });
          broadcastState(io, tossed);

          setTimeout(() => {
            void withRoomLock(data.roomCode, async () => {
              try {
                const cur = getRoom(data.roomCode);
                if (!cur || cur.phase !== "coin_toss") return;
                const dealt = startRound(cur);
                await dealWithShuffleAnimation(io, data.roomCode, dealt);
              } catch (err: unknown) {
                logger.error({ err }, "Error dealing first round");
              }
            });
          }, 3500);
        } catch (err: unknown) {
          logger.error({ err }, "Error starting game");
        }
      });
    });

    socket.on(
      "place_bid",
      (
        data: { roomCode: string; amount: number },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        if (!checkRate(socket.id, "place_bid", 20, 5_000)) {
          return callback({ ok: false, error: "Slow down." });
        }
        void withRoomLock(data.roomCode, async () => {
          try {
            const state = getRoom(data.roomCode);
            if (!state) throw new Error("Room not found");

            const playerIndex = state.players.findIndex(
              (p) => p?.socketId === socket.id
            ) as 0 | 1;
            if (playerIndex < 0) throw new Error("Player not found");
            if (state.phase !== "bidding") throw new Error("Not in bidding phase");
            if (state.isPaused) throw new Error("Match is paused by host");

            const { state: newState, bothBid } = placeBid(state, playerIndex, data.amount);
            armTurnTimer(io, newState);
            await commit(newState, {
              action: "bid_placed",
              actorSeat: playerIndex,
              payload: { amount: data.amount, auto: false, bothBid },
            });

            callback({ ok: true });
            broadcastState(io, newState);
            for (let i = 0; i < 2; i++) {
              const p = newState.players[i];
              if (p) {
                io.to(p.socketId).emit("bid_placed", {
                  playerIndex,
                  amount: data.amount,
                  bothBid,
                });
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            callback({ ok: false, error: msg });
          }
        });
      }
    );

    socket.on(
      "play_card",
      (
        data: { roomCode: string; card: Card },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        if (!checkRate(socket.id, "play_card", 30, 5_000)) {
          return callback({ ok: false, error: "Slow down." });
        }
        void withRoomLock(data.roomCode, async () => {
          try {
            const state = getRoom(data.roomCode);
            if (!state) throw new Error("Room not found");

            const playerIndex = state.players.findIndex(
              (p) => p?.socketId === socket.id
            ) as 0 | 1;
            if (playerIndex < 0) throw new Error("Player not found");
            if (state.isPaused) throw new Error("Match is paused by host");

            const result = playCard(state, playerIndex, data.card);

            callback({ ok: true });

            await handlePlayResult(io, data.roomCode, state, result, playerIndex, false);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            callback({ ok: false, error: msg });
          }
        });
      }
    );

    socket.on("next_round", (data: { roomCode: string }) => {
      void withRoomLock(data.roomCode, async () => {
        try {
          const state = getRoom(data.roomCode);
          if (!state) return;
          if (state.phase !== "round_over") return;
          if (state.players[0]?.socketId !== socket.id) return;

          const newState = startRound(state);
          await dealWithShuffleAnimation(io, data.roomCode, newState);
        } catch (err: unknown) {
          logger.error({ err }, "Error advancing round");
        }
      });
    });

    socket.on(
      "reconnect_player",
      async (
        data: { roomCode: string; playerIndex: 0 | 1; playerName: string; token?: string },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          // Token-first validation, gated on the per-seat tokenizedSeats
          // flag in the (persisted) GameState — NOT a DB lookup. This way
          // a DB outage cannot silently downgrade a tokenized seat back to
          // the name-match path (which is hijack-prone for null-slot
          // seats after disconnect).
          //   - flag=true  → token required and must validate; if DB is
          //                  down, we reject with a retryable error
          //                  rather than fall back.
          //   - flag=false → legacy/no-token-on-file room; fall back to
          //                  engine name match (preserves existing UX for
          //                  rooms created before tokens shipped).
          const existing = getRoom(code);
          const seatTokenized = existing?.tokenizedSeats?.[data.playerIndex] === true;
          if (seatTokenized) {
            if (!data.token) {
              throw new Error("Reconnect token required for this seat");
            }
            const v = await validateReconnectToken(code, data.playerIndex, data.token);
            if (!v.ok) {
              // token_mismatch / not_found → caller is wrong. db_error → we
              // refuse to fail open: caller should retry, not be auto-trusted.
              throw new Error(
                v.reason === "db_error"
                  ? "Reconnect temporarily unavailable, please retry"
                  : v.reason === "token_mismatch"
                  ? "That seat is held by another player"
                  : "Reconnect token invalid",
              );
            }
            data = { ...data, playerName: v.displayName };
          }
          let state: GameState | null = null;
          let recErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              state = reconnectPlayer(code, data.playerIndex, socket.id, data.playerName);
              await commit(state, {
                action: "reconnect",
                actorSeat: data.playerIndex,
                payload: { playerName: data.playerName, role: "player" },
              });
            } catch (e) {
              recErr = e as Error;
            }
          });
          if (recErr || !state) throw recErr ?? new Error("Reconnect failed");
          const s: GameState = state!;
          socket.join(code);
          socket.data.playerName = data.playerName;
          logger.info(
            { roomCode: code, playerIndex: data.playerIndex, playerName: data.playerName },
            "Player reconnected"
          );
          cancelAutoForfeit(code, data.playerIndex);

          callback({ ok: true });

          const otherIndex = data.playerIndex === 0 ? 1 : 0;
          const other = s.players[otherIndex];
          if (other) {
            io.to(other.socketId).emit("opponent_reconnected", { playerName: data.playerName });
          }
          broadcastState(io, s);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          logger.warn({ err, data }, "Reconnect failed");
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on("new_match", (data: { roomCode: string }) => {
      void withRoomLock(data.roomCode, async () => {
        try {
          const state = getRoom(data.roomCode);
          if (!state) return;
          if (state.phase !== "game_over") return;
          if (state.players[0]?.socketId !== socket.id) return;
          if (!state.players[0] || !state.players[1]) return;
          if (state.tournamentRef) {
            logger.warn(
              { roomCode: data.roomCode, tournamentRef: state.tournamentRef },
              "Rejected new_match on tournament room (rematches not allowed in bracket play)"
            );
            return;
          }

          const reset  = resetMatch(state);
          const tossed = performCoinToss(reset);
          await commit(tossed, {
            action: "coin_toss",
            actorSeat: 0,
            payload: { newMatch: true, winner: tossed.coinFlipWinner, firstBidder: tossed.firstBidderRound1 },
          });
          broadcastState(io, tossed);

          setTimeout(() => {
            void withRoomLock(data.roomCode, async () => {
              try {
                const current = getRoom(data.roomCode);
                if (!current || current.phase !== "coin_toss") return;
                const dealt = startRound(current);
                await dealWithShuffleAnimation(io, data.roomCode, dealt);
              } catch (err: unknown) {
                logger.error({ err }, "Error dealing first round of new match");
              }
            });
          }, 3500);
        } catch (err: unknown) {
          logger.error({ err }, "Error starting new match");
        }
      });
    });

    socket.on(
      "join_as_spectator",
      async (
        data: { roomCode: string; spectatorName: string },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const name = (data.spectatorName || "Spectator").slice(0, 24);
          let state: GameState | null = null;
          let specErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              state = addSpectator(code, name, socket.id);
              await commit(state, {
                action: "spectator_joined",
                payload: { name },
              });
            } catch (e) {
              specErr = e as Error;
            }
          });
          if (specErr || !state) throw specErr ?? new Error("Spectator join failed");
          const s: GameState = state!;
          socket.join(code);
          socket.data.playerName = name;
          logger.info({ roomCode: code, playerName: name }, "Spectator joined");

          callback({ ok: true });
          socket.emit("game_state", sanitizeStateForSpectator(s));
          broadcastState(io, s);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "reconnect_spectator",
      async (
        data: { roomCode: string; spectatorName: string },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const name = (data.spectatorName || "Spectator").slice(0, 24);
          let state: GameState | null = null;
          let recErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              state = reconnectSpectator(code, name, socket.id);
              await commit(state, {
                action: "reconnect",
                payload: { name, role: "spectator" },
              });
            } catch (e) {
              recErr = e as Error;
            }
          });
          if (recErr || !state) throw recErr ?? new Error("Spectator reconnect failed");
          const s: GameState = state!;
          socket.join(code);
          socket.data.playerName = name;
          logger.info({ roomCode: code, playerName: name }, "Spectator reconnected");

          callback({ ok: true });
          socket.emit("game_state", sanitizeStateForSpectator(s));
          broadcastState(io, s);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "set_ready",
      async (
        data: { roomCode: string; ready: boolean },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          let state: GameState | null = null;
          let rErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              state = setPlayerReady(code, socket.id, !!data.ready);
              const seatIdx = state.players.findIndex((p) => p?.socketId === socket.id);
              await commit(state, {
                action: "player_ready",
                actorSeat: seatIdx >= 0 ? seatIdx : null,
                payload: { ready: !!data.ready },
              });
            } catch (e) {
              rErr = e as Error;
            }
          });
          if (rErr || !state) throw rErr ?? new Error("set_ready failed");
          callback?.({ ok: true });
          broadcastState(io, state!);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "join_queue",
      async (
        data: { roomCode: string; name: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          let state: GameState | null = null;
          let qErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              state = addChallenger(code, data.name, socket.id);
              await commit(state, {
                action: "challenger_joined",
                payload: { name: data.name },
              });
            } catch (e) {
              qErr = e as Error;
            }
          });
          if (qErr || !state) throw qErr ?? new Error("join_queue failed");
          const s: GameState = state!;
          socket.join(code);
          logger.info({ roomCode: code, name: data.name }, "Challenger joined queue");
          callback?.({ ok: true });
          broadcastState(io, s);
          if (s.phase === "game_over" && s.mode === "king") {
            scheduleKingNextMatch(io, code);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "leave_queue",
      async (
        data: { roomCode: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          let state: GameState | null = null;
          await withRoomLock(code, async () => {
            state = removeChallenger(code, socket.id);
            if (state) {
              await commit(state, {
                action: "challenger_left",
                payload: { socketId: socket.id },
              });
            }
          });
          callback?.({ ok: true });
          if (state) broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    // ── Custom Tournament events ───────────────────────────────────────────

    socket.on(
      "create_tournament",
      (
        data: { hostName: string; name?: string; size?: number; matchTarget?: number },
        callback?: (res: { ok: boolean; code?: string; token?: string; error?: string }) => void
      ) => {
        try {
          if (!checkRate(socket.id, "create_tournament", 3, 60_000)) {
            return callback?.({ ok: false, error: "Slow down — too many tournaments created." });
          }
          const host = (data.hostName || "Host").slice(0, 24);
          const { tournament: t, hostToken } = createTournamentEntity(host, socket.id, {
            name: data.name,
            size: data.size,
            matchTarget: data.matchTarget,
          });
          socket.join(`tournament:${t.code}`);
          (socket.data as { playerName?: string }).playerName = host;
          logger.info({ code: t.code, host, size: t.size, socketId: socket.id }, "Tournament created");
          callback?.({ ok: true, code: t.code, token: hostToken });
          io.to(`tournament:${t.code}`).emit("tournament_state", sanitizeTournament(t));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "join_tournament",
      (
        data: { code: string; name: string; token?: string },
        callback?: (res: { ok: boolean; error?: string; state?: unknown; token?: string }) => void
      ) => {
        try {
          if (!checkRate(socket.id, "join_tournament", 10, 30_000)) {
            return callback?.({ ok: false, error: "Slow down — too many join attempts." });
          }
          const code = (data.code || "").toUpperCase().trim();
          const name = (data.name || "").slice(0, 24);
          const { tournament: t, token, joinedFresh } = joinTournamentEntity(code, name, socket.id, data.token);
          socket.join(`tournament:${code}`);
          (socket.data as { playerName?: string }).playerName = name;
          logger.info({ code, name, joinedFresh, socketId: socket.id }, "Tournament joined");
          callback?.({ ok: true, state: sanitizeTournament(t), token });
          io.to(`tournament:${code}`).emit("tournament_state", sanitizeTournament(t));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "leave_tournament",
      (
        data: { code: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = leaveTournamentEntity(code, socket.id);
          socket.leave(`tournament:${code}`);
          callback?.({ ok: true });
          if (t) io.to(`tournament:${code}`).emit("tournament_state", sanitizeTournament(t));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "subscribe_tournament",
      (
        data: { code: string; playerName?: string; token?: string },
        callback?: (res: { ok: boolean; error?: string; state?: unknown; yourMatch?: { roomCode: string | null; matchId: string } | null; authenticated?: boolean }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          socket.join(`tournament:${code}`);
          // Token-authenticated reattach: only if BOTH name and token match.
          // Without this, anyone who knew a participant's display name could
          // hijack their socket binding (and their future match_assigned).
          let authenticated = false;
          if (data.playerName && data.token) {
            const result = reattachPlayerSocket(code, data.playerName, data.token, socket.id);
            if (result) {
              authenticated = true;
              // Re-emit any pending match assignment so a refresh on the
              // tournament page lands them back in their live match.
              const pending = result.player.pendingAssignment;
              if (pending) {
                // Join the game room so subsequent game_state broadcasts arrive.
                socket.join(pending.roomCode);
                socket.emit("match_assigned", {
                  tournamentCode: code,
                  ...pending,
                });
              }
            }
          }
          const yourMatch = authenticated && data.playerName
            ? findActiveMatchForPlayer(t, data.playerName)
            : null;
          callback?.({
            ok: true,
            state: sanitizeTournament(t),
            yourMatch: yourMatch ? { roomCode: yourMatch.roomCode, matchId: yourMatch.id } : null,
            authenticated,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    // Legacy event preserved for back-compat with existing Tournament.tsx
    // forfeit controls. Identical to admin_force_forfeit; writes the same
    // audit row. Prefer admin_force_forfeit in new code.
    socket.on(
      "tournament_force_forfeit",
      (
        data: { code: string; matchId: string; forfeitSeat: "A" | "B"; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        void runAdminForceForfeit(io, data, callback);
      }
    );

    // ── Host admin tools ──────────────────────────────────────────────────
    //
    // Every event below is gated by `requireTournamentHost(t, token)` —
    // there is NO socketId fallback (unlike start_tournament) because
    // these actions are higher-stakes than starting and must not be
    // triggerable just because the host's old socketId hasn't recycled.
    //
    // Every successful action appends an `AdminAuditEntry` to the
    // tournament's bounded in-memory audit log. Bracket advancements
    // additionally hit the DB-backed game_audit_log via
    // recordMatchResultTx.

    socket.on(
      "admin_force_forfeit",
      (
        data: { code: string; matchId: string; forfeitSeat: "A" | "B"; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        void runAdminForceForfeit(io, data, callback);
      }
    );

    socket.on(
      "admin_pause_match",
      (
        data: { code: string; matchId: string; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          const host = requireTournamentHost(t, data.token);
          const match = findMatchById(t, data.matchId);
          if (!match) throw new Error("Match not found");
          if (!match.roomCode) throw new Error("Match has no room yet");
          if (match.winner) throw new Error("Match already resolved");
          const roomCode = match.roomCode;
          void withRoomLock(roomCode, async () => {
            const state = getRoom(roomCode);
            if (!state) return;
            if (state.isPaused) return; // idempotent
            const paused: GameState = { ...state, isPaused: true };
            clearTurnTimer(roomCode);
            paused.turnDeadline = null;
            await commit(paused, {
              action: "admin_pause",
              payload: { matchId: match.id, actor: host.name },
            });
            appendAdminAudit(t, {
              action: "pause_match",
              actorName: host.name,
              matchId: match.id,
              roomCode,
            });
            broadcastState(io, paused);
            io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
          });
          callback?.({ ok: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "admin_resume_match",
      (
        data: { code: string; matchId: string; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          const host = requireTournamentHost(t, data.token);
          const match = findMatchById(t, data.matchId);
          if (!match) throw new Error("Match not found");
          if (!match.roomCode) throw new Error("Match has no room yet");
          const roomCode = match.roomCode;
          void withRoomLock(roomCode, async () => {
            const state = getRoom(roomCode);
            if (!state) return;
            if (!state.isPaused) return; // idempotent
            const resumed: GameState = { ...state, isPaused: false };
            armTurnTimer(io, resumed);
            await commit(resumed, {
              action: "admin_resume",
              payload: { matchId: match.id, actor: host.name },
            });
            appendAdminAudit(t, {
              action: "resume_match",
              actorName: host.name,
              matchId: match.id,
              roomCode,
            });
            broadcastState(io, resumed);
            io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
          });
          callback?.({ ok: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "admin_reset_timer",
      (
        data: { code: string; matchId: string; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          const host = requireTournamentHost(t, data.token);
          const match = findMatchById(t, data.matchId);
          if (!match) throw new Error("Match not found");
          if (!match.roomCode) throw new Error("Match has no room yet");
          if (match.winner) throw new Error("Match already resolved");
          const roomCode = match.roomCode;
          void withRoomLock(roomCode, async () => {
            const state = getRoom(roomCode);
            if (!state) return;
            if (state.isPaused) {
              // Reset while paused = pointless and confusing.
              return;
            }
            armTurnTimer(io, state);
            appendAdminAudit(t, {
              action: "reset_timer",
              actorName: host.name,
              matchId: match.id,
              roomCode,
              payload: { newDeadline: state.turnDeadline },
            });
            broadcastState(io, state);
            io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
          });
          callback?.({ ok: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "admin_remake_room",
      async (
        data: { code: string; matchId: string; token?: string },
        callback?: (res: { ok: boolean; error?: string; newRoomCode?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          const host = requireTournamentHost(t, data.token);
          const match = findMatchById(t, data.matchId);
          if (!match) throw new Error("Match not found");
          if (match.winner) throw new Error("Match already resolved — cannot remake");
          if (!match.playerA || !match.playerB) {
            throw new Error("Match has no player pair yet");
          }
          // Tear down the old room (if any). Critically, this MUST happen
          // under the old room's lock so any in-flight play_card /
          // trick-resolve / timer commit has fully drained before we
          // delete state — otherwise a stale commit in updateRoom can
          // resurrect the room AFTER cleanup and create split-brain
          // (bracket points to new room, ghost room still emits events).
          const oldRoomCode = match.roomCode;
          if (oldRoomCode) {
            await withRoomLock(oldRoomCode, async () => {
              clearTurnTimer(oldRoomCode);
              try {
                cleanupRoom(oldRoomCode);
              } catch {
                /* best-effort */
              }
              // Persistent room state — best-effort DB cleanup.
              await deleteRoomState(oldRoomCode).catch(() => {});
              // Notify any still-attached clients that the room is gone
              // so their UI doesn't sit on a dead state.
              io.to(oldRoomCode).emit("room_remade", {
                oldRoomCode,
                reason: "host_remake",
              });
            });
            // Only detach AFTER drain — bracket pointer stays consistent
            // until the old room is fully gone.
            detachMatchRoom(t, match.id);
          }
          await createMatchRoomAndAssign(io, t, match);
          appendAdminAudit(t, {
            action: "remake_room",
            actorName: host.name,
            matchId: match.id,
            roomCode: match.roomCode ?? undefined,
            payload: { oldRoomCode: oldRoomCode ?? null },
          });
          io.to(`tournament:${code}`).emit(
            "tournament_state",
            sanitizeTournament(t),
          );
          io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
          callback?.({ ok: true, newRoomCode: match.roomCode ?? undefined });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "admin_mark_winner",
      async (
        data: { code: string; matchId: string; winnerSeat: "A" | "B"; token?: string },
        callback?: (res: { ok: boolean; error?: string; replay?: boolean }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          const host = requireTournamentHost(t, data.token);
          const match = findMatchById(t, data.matchId);
          if (!match) throw new Error("Match not found");
          if (!match.playerA || !match.playerB) {
            throw new Error("Match has no player pair yet");
          }
          // If there's a live room, flip it to game_over via the existing
          // forfeit pipeline — that path handles state cleanup, broadcasts,
          // AND calls advanceTournamentOnGameOver (which goes through
          // recordMatchResult and gets idempotency / rollback for free).
          if (match.roomCode && !match.winner) {
            const forfeitSeat: 0 | 1 = data.winnerSeat === "A" ? 1 : 0;
            const liveRoomCode = match.roomCode;
            // Await so the callback truthfully reports completion (lock
            // acquired, commit landed, bracket advanced). Otherwise a
            // stale/missing room could silently no-op and we'd still
            // audit + ack a non-event.
            await forfeitTournamentMatch(io, liveRoomCode, forfeitSeat, "host_forced");
            if (!match.winner) {
              throw new Error("Mark winner did not advance — room may have been removed");
            }
            appendAdminAudit(t, {
              action: "mark_winner",
              actorName: host.name,
              matchId: match.id,
              roomCode: match.roomCode,
              payload: { winnerSeat: data.winnerSeat, via: "forfeit" },
            });
            io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
            callback?.({ ok: true });
            return;
          }
          // No live room (e.g. future-round slot with both feeders resolved
          // but the room creator hasn't yet spun it up, or a replay of an
          // already-decided match). recordMatchResult handles idempotency.
          const resolution = await recordMatchResult(
            code,
            match.id,
            data.winnerSeat,
            { roomCodeForAudit: match.roomCode },
          );
          if (resolution.kind === "rejected") {
            throw new Error(resolution.message);
          }
          const isReplay = resolution.kind === "replay";
          appendAdminAudit(t, {
            action: "mark_winner",
            actorName: host.name,
            matchId: match.id,
            roomCode: match.roomCode ?? undefined,
            payload: {
              winnerSeat: data.winnerSeat,
              via: "direct",
              replay: isReplay,
            },
          });
          // First-time direct advance: trigger the same downstream effects
          // (eliminate loser, create next-round rooms, broadcast).
          if (!isReplay) {
            const effect = resolution.effect;
            const a = effect.resolvedMatch.playerA?.name;
            const b = effect.resolvedMatch.playerB?.name;
            if (a) clearPendingAssignment(effect.tournament, a);
            if (b) clearPendingAssignment(effect.tournament, b);
            if (effect.loserName) {
              const loserSid = getPlayerSocketIdByName(
                effect.tournament,
                effect.loserName,
              );
              if (loserSid) {
                io.to(loserSid).emit("tournament_eliminated", {
                  tournamentCode: code,
                  round: effect.resolvedMatch.round,
                  finishedRound: effect.resolvedMatch.round,
                });
              }
            }
            io.to(`tournament:${code}`).emit(
              "tournament_state",
              sanitizeTournament(effect.tournament),
            );
            void (async () => {
              for (const next of effect.newlyReadyMatches) {
                await createMatchRoomAndAssign(io, effect.tournament, next);
              }
              if (effect.newlyReadyMatches.length > 0) {
                io.to(`tournament:${code}`).emit(
                  "tournament_state",
                  sanitizeTournament(effect.tournament),
                );
              }
            })();
            if (effect.isFinal && effect.championName) {
              io.to(`tournament:${code}`).emit("tournament_complete", {
                tournamentCode: code,
                champion: effect.championName,
              });
            }
          }
          io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
          callback?.({ ok: true, replay: isReplay });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "host_replace_player",
      (
        data: { code: string; oldName: string; newName: string; token?: string },
        callback?: (res: { ok: boolean; error?: string; newPlayerToken?: string; removedName?: string; replacementName?: string }) => void
      ) => {
        // Rate-limit per-socket: replacement is a lobby-only admin action,
        // 5 per 30s is plenty for legitimate use and stops a buggy/malicious
        // host client from spamming roster updates to the whole tournament.
        if (!checkRate(socket.id, "host_replace_player", 5, 30_000)) {
          callback?.({ ok: false, error: "Too many replacement attempts — slow down" });
          return;
        }
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          const host = requireTournamentHost(t, data.token);
          if (t.status !== "lobby") {
            // Explicit message: spec requirement #9.
            throw new Error("Cannot replace players after the tournament has started");
          }
          const result = replacePlayer(code, data.oldName || "", data.newName || "");
          appendAdminAudit(t, {
            action: "replace_player",
            actorName: host.name,
            payload: {
              removedName: result.removedName,
              replacementName: result.replacementName,
            },
          });
          // Broadcast the new roster to the tournament room so every lobby
          // viewer's player list updates immediately.
          io.to(`tournament:${code}`).emit(
            "tournament_state",
            sanitizeTournament(t),
          );
          io.to(`tournament:${code}`).emit("admin_audit_appended", { code });
          // Token is returned ONLY to the calling host via the callback.
          // It does NOT enter `sanitizeTournament` or any broadcast.
          callback?.({
            ok: true,
            newPlayerToken: result.newPlayerToken,
            removedName: result.removedName,
            replacementName: result.replacementName,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "admin_audit_log",
      (
        data: { code: string; token?: string; limit?: number },
        callback?: (res: { ok: boolean; error?: string; entries?: AdminAuditEntry[] }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          requireTournamentHost(t, data.token);
          const limit = Math.max(1, Math.min(500, data.limit ?? 100));
          callback?.({ ok: true, entries: getAdminAuditLog(t, limit) });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "admin_dashboard",
      (
        data: { code: string; token?: string },
        callback?: (
          res: {
            ok: boolean;
            error?: string;
            snapshot?: ReturnType<typeof buildAdminDashboard>;
          },
        ) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = getTournament(code);
          if (!t) throw new Error("Tournament not found");
          requireTournamentHost(t, data.token);
          callback?.({ ok: true, snapshot: buildAdminDashboard(io, t) });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "start_tournament",
      async (
        data: { code: string; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = startTournamentEntity(code, socket.id, data.token);
          logger.info({ code, size: t.size }, "Tournament started by host");
          callback?.({ ok: true });
          // Spin up Round 1 rooms for each match, in order. Await so each
          // room is durable + announced before the next starts (and before
          // the bracket broadcast tells subscribers about the new rooms).
          for (const match of t.rounds[0]) {
            await createMatchRoomAndAssign(io, t, match);
          }
          io.to(`tournament:${code}`).emit("tournament_state", sanitizeTournament(t));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "reset_room",
      async (
        data: { roomCode: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          let state: GameState | null = null;
          let rErr: Error | null = null;
          await withRoomLock(code, async () => {
            try {
              const existing = getRoom(code);
              if (existing?.tournamentRef) {
                throw new Error(
                  "Cannot reset a tournament match room. Use Back to Tournament Bracket instead."
                );
              }
              state = resetRoom(code, socket.id);
              await commit(state, {
                action: "room_reset",
                actorSeat: 0,
                payload: {},
              });
            } catch (e) {
              rErr = e as Error;
            }
          });
          if (rErr || !state) throw rErr ?? new Error("reset_room failed");
          logger.info({ roomCode: code }, "Room reset by host");
          callback?.({ ok: true });
          broadcastState(io, state!);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on("disconnect", () => {
      clearRateForSocket(socket.id);
      const playerName = (socket.data as { playerName?: string }).playerName;
      logger.info({ socketId: socket.id, playerName }, "Socket disconnected");
      // Snapshot which tournament-match seat this socket occupied (if any)
      // BEFORE removePlayerFromRoom nulls it, so we can arm an auto-forfeit.
      const before = getRoomBySocketId(socket.id);
      let tournamentSeat: { roomCode: string; idx: 0 | 1 } | null = null;
      let beforeRoomCode: string | null = null;
      if (before) beforeRoomCode = before.roomCode;
      if (
        before &&
        before.tournamentRef &&
        before.phase !== "waiting" &&
        before.phase !== "game_over"
      ) {
        const seat = before.players.findIndex((p) => p?.socketId === socket.id);
        if (seat === 0 || seat === 1) {
          tournamentSeat = { roomCode: before.roomCode, idx: seat };
        }
      }

      // removePlayerFromRoom is a synchronous scan-and-mutate (atomic from
      // JS's POV — no other handler can observe a half-removed slot). Run it
      // first so we know which room to lock; then take that room's lock for
      // the durable commit + broadcast. This avoids the "pre-scan then race
      // with in-flight join inside the lock" window the architect flagged.
      const state = removePlayerFromRoom(socket.id);
      if (state) {
        void withRoomLock(state.roomCode, async () => {
          await commit(state, {
            action: "disconnect",
            payload: { socketId: socket.id, playerName: playerName ?? null },
          });
          const remaining = state.players.find((p) => p !== null);
          if (remaining) {
            io.to(remaining.socketId).emit("opponent_disconnected", {});
          }
          broadcastState(io, state);
        });
      }

      if (tournamentSeat) {
        scheduleAutoForfeit(io, tournamentSeat.roomCode, tournamentSeat.idx);
      }
    });
  });

  return io;
}
