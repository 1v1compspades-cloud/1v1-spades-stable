import { Server as SocketIOServer } from "socket.io";
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
  removePlayerFromRoom,
  getRoomBySocketId,
  reconnectPlayer,
  resetMatch,
  resetRoom,
  setPlayerReady,
  addSpectator,
  reconnectSpectator,
  performCoinToss,
  addChallenger,
  removeChallenger,
  promoteNextChallenger,
  type GameState,
} from "./engine.js";
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
  type Tournament,
  type TournamentMatch,
  type PendingAssignment,
} from "./tournament.js";

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
  };
}

/** Duration of the visual shuffle + deal animation between phases. */
const SHUFFLE_ANIMATION_MS = 2600;

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
function dealWithShuffleAnimation(
  io: SocketIOServer,
  roomCode: string,
  dealt: GameState
): void {
  const shuffling: GameState = { ...dealt, phase: "shuffling" };
  updateRoom(shuffling);
  broadcastState(io, shuffling);

  setTimeout(() => {
    try {
      const current = getRoom(roomCode);
      if (!current || current.phase !== "shuffling") return;
      const ready: GameState = { ...current, phase: "bidding" };
      updateRoom(ready);
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
  const fromFinal = totalRounds - round; // 0 = final, 1 = semi, 2 = quarter
  if (fromFinal === 0) return "Finals";
  if (fromFinal === 1) return `Semifinal ${position + 1}`;
  if (fromFinal === 2) return `Quarterfinal ${position + 1}`;
  return `R${round} M${position + 1}`;
}

/**
 * Tournament: spin up a freshly-seated game room for a bracket match.
 * Looks up both players' current socketIds, creates the room with player A
 * as host, joins player B, records the room code on the match, and emits
 * `match_assigned` to each player's socket so the client can navigate.
 */
function createMatchRoomAndAssign(
  io: SocketIOServer,
  t: Tournament,
  match: TournamentMatch
): void {
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
  joinRoom(room.roomCode, match.playerB.name, sB);
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
function advanceTournamentOnGameOver(io: SocketIOServer, state: GameState): void {
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

  let effect;
  try {
    effect = recordMatchResult(code, matchId, winnerSeat);
  } catch (err: unknown) {
    logger.error({ err, code, matchId }, "Failed to record tournament match result");
    return;
  }

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

  // Spin up rooms for any next-round matches that now have both feeders.
  for (const next of effect.newlyReadyMatches) {
    createMatchRoomAndAssign(io, effect.tournament, next);
  }

  // Broadcast updated bracket state to all tournament subscribers.
  io.to(`tournament:${code}`).emit("tournament_state", sanitizeTournament(effect.tournament));

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
    try {
      const cur = getRoom(roomCode);
      if (!cur || cur.phase !== "game_over" || cur.mode !== "king") return;
      if (cur.challengerQueue.length === 0) return;

      const result = promoteNextChallenger(roomCode);
      if (!result) {
        // Couldn't promote (e.g. both seats empty). Leave in game_over;
        // a future `join_queue` or `reconnect` will reschedule us.
        return;
      }

      // Ensure the promoted challenger's socket is joined to the room so
      // room-scoped emits (trick_complete, round_over, etc.) reach them.
      const promotedSock = io.sockets.sockets.get(result.promoted.socketId);
      if (promotedSock) {
        promotedSock.join(roomCode);
      } else {
        // Promoted challenger vanished before rotation fired — roll back.
        logger.warn({ roomCode, socketId: result.promoted.socketId }, "Promoted challenger disconnected; aborting rotation");
        const rolled = getRoom(roomCode);
        if (rolled) {
          rolled.players[result.promoted.playerIndex] = null;
          updateRoom(rolled);
          broadcastState(io, rolled);
          // Try again with the next challenger (if any).
          if (rolled.challengerQueue.length > 0) {
            scheduleKingNextMatch(io, roomCode);
          }
        }
        return;
      }

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

      // Broadcast the freshly-reset state so everyone sees new seats + queue.
      broadcastState(io, result.state);

      // Coin toss → deal Round 1, mirroring the new_match flow.
      const tossed = performCoinToss(result.state);
      updateRoom(tossed);
      broadcastState(io, tossed);

      setTimeout(() => {
        try {
          const c = getRoom(roomCode);
          if (!c || c.phase !== "coin_toss") return;
          // Re-validate both seats are still filled — either side could have
          // disconnected during the 3.5s coin-toss window.
          if (!c.players[0] || !c.players[1]) {
            logger.warn({ roomCode }, "Seat went empty during KotT coin toss; reverting to game_over");
            c.phase = "game_over";
            updateRoom(c);
            broadcastState(io, c);
            if (c.challengerQueue.length > 0) {
              scheduleKingNextMatch(io, roomCode);
            }
            return;
          }
          const dealt = startRound(c);
          dealWithShuffleAnimation(io, roomCode, dealt);
        } catch (err: unknown) {
          logger.error({ err, roomCode }, "Error dealing first round of KotT next match");
        }
      }, 3500);
    } catch (err: unknown) {
      logger.error({ err, roomCode }, "Error scheduling KotT next match");
    }
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

export function setupSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on(
      "create_room",
      (
        data: { playerName: string; matchTarget?: number; matchLabel?: string; mode?: string },
        callback: (res: { ok: boolean; roomCode?: string; playerIndex?: number; error?: string }) => void
      ) => {
        try {
          // Accept any positive integer match target. Default to 250.
          // UI restricts to 250/500; lower values are allowed for tests.
          const rawTarget = Number(data.matchTarget);
          const target = Number.isFinite(rawTarget) && rawTarget > 0 && rawTarget <= 5000
            ? Math.floor(rawTarget)
            : 250;
          // Optional match label (e.g. "Quarterfinal 1"). Trimmed, length-capped.
          const rawLabel = typeof data.matchLabel === "string" ? data.matchLabel.trim() : "";
          const label = rawLabel ? rawLabel.slice(0, 40) : undefined;
          const mode: "quick" | "king" = data.mode === "king" ? "king" : "quick";
          const state = createRoom(data.playerName, socket.id, target, label, mode);
          socket.join(state.roomCode);
          logger.info({ roomCode: state.roomCode, playerName: data.playerName }, "Room created");
          callback({ ok: true, roomCode: state.roomCode, playerIndex: 0 });
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "join_room",
      (
        data: { roomCode: string; playerName: string },
        callback: (res: { ok: boolean; playerIndex?: number; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const { state, playerIndex } = joinRoom(code, data.playerName, socket.id);
          socket.join(code);
          logger.info({ roomCode: code, playerName: data.playerName }, "Player joined room");

          callback({ ok: true, playerIndex });

          // Notify host
          const hostSocket = state.players[0]?.socketId;
          if (hostSocket) {
            io.to(hostSocket).emit("opponent_joined", {
              playerName: data.playerName,
            });
          }
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on("start_game", (data: { roomCode: string }) => {
      try {
        const state = getRoom(data.roomCode);
        if (!state) return;
        if (state.players[0]?.socketId !== socket.id) return;
        if (!state.players[1]) return;
        // Only meaningful from "waiting" phase.
        if (state.phase !== "waiting") return;
        // Both players must have readied up.
        if (!state.ready[0] || !state.ready[1]) return;

        // Step 1: flip the coin once and broadcast the result.
        const tossed = performCoinToss(state);
        updateRoom(tossed);
        broadcastState(io, tossed);

        // Step 2: after a brief display delay, deal Round 1 and start bidding.
        // The loser bids first in Round 1 (handled by startRound via
        // getFirstBidderForRound).
        setTimeout(() => {
          const cur = getRoom(data.roomCode);
          if (!cur || cur.phase !== "coin_toss") return;
          const dealt = startRound(cur);
          dealWithShuffleAnimation(io, data.roomCode, dealt);
        }, 3500);
      } catch (err: unknown) {
        logger.error({ err }, "Error starting game");
      }
    });

    socket.on(
      "place_bid",
      (
        data: { roomCode: string; amount: number },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const state = getRoom(data.roomCode);
          if (!state) throw new Error("Room not found");

          const playerIndex = state.players.findIndex(
            (p) => p?.socketId === socket.id
          ) as 0 | 1;
          if (playerIndex < 0) throw new Error("Player not found");
          if (state.phase !== "bidding") throw new Error("Not in bidding phase");

          const { state: newState, bothBid } = placeBid(state, playerIndex, data.amount);
          updateRoom(newState);

          callback({ ok: true });

          // Send updated state to both players + spectators
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
      }
    );

    socket.on(
      "play_card",
      (
        data: { roomCode: string; card: Card },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const state = getRoom(data.roomCode);
          if (!state) throw new Error("Room not found");

          const playerIndex = state.players.findIndex(
            (p) => p?.socketId === socket.id
          ) as 0 | 1;
          if (playerIndex < 0) throw new Error("Player not found");

          const result = playCard(state, playerIndex, data.card);

          callback({ ok: true });

          if (result.trickComplete && result.intermediateState) {
            // ── Trick just completed: two-phase update ──────────────────────
            // Phase 1: store intermediate state (cards visible, no one can play)
            // and push it to both clients immediately.
            updateRoom(result.intermediateState);
            broadcastState(io, result.intermediateState);
            io.to(data.roomCode).emit("trick_complete", {
              winner: result.trickWinner,
              tricks: result.intermediateState.tricks,
            });

            // Phase 2 (after 700 ms): store final state and push cleared table.
            setTimeout(() => {
              // Guard: make sure the room still exists and hasn't been modified
              // by a reconnect or other event during the delay.
              const current = getRoom(data.roomCode);
              if (!current) return;

              updateRoom(result.state);
              broadcastState(io, result.state);

              if (result.roundComplete) {
                io.to(data.roomCode).emit("round_over", {
                  scores: result.state.scores,
                  bags: result.state.bags,
                  tricks: result.state.tricks,
                  bids: [state.bids[0], state.bids[1]],
                  roundHistory: result.state.roundHistory,
                  phase: result.state.phase,
                });
              }

              // KotT: auto-rotate to next challenger after game_over (if queue non-empty).
              if (
                result.state.phase === "game_over" &&
                result.state.mode === "king" &&
                result.state.challengerQueue.length > 0
              ) {
                scheduleKingNextMatch(io, data.roomCode);
              }

              // Tournament: advance the bracket if this match was a bracket node.
              if (
                result.state.phase === "game_over" &&
                result.state.tournamentRef
              ) {
                advanceTournamentOnGameOver(io, result.state);
              }
            }, 700);

          } else {
            // ── Mid-trick (first card played): push state immediately ────────
            updateRoom(result.state);
            broadcastState(io, result.state);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on("next_round", (data: { roomCode: string }) => {
      try {
        const state = getRoom(data.roomCode);
        if (!state) return;
        if (state.phase !== "round_over") return;

        // Only host can advance
        if (state.players[0]?.socketId !== socket.id) return;

        const newState = startRound(state);
        dealWithShuffleAnimation(io, data.roomCode, newState);
      } catch (err: unknown) {
        logger.error({ err }, "Error advancing round");
      }
    });

    socket.on(
      "reconnect_player",
      (
        data: { roomCode: string; playerIndex: 0 | 1; playerName: string },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const state = reconnectPlayer(code, data.playerIndex, socket.id, data.playerName);
          socket.join(code);
          logger.info({ roomCode: code, playerIndex: data.playerIndex }, "Player reconnected");

          callback({ ok: true });

          // Notify the other player that their opponent is back
          const otherIndex = data.playerIndex === 0 ? 1 : 0;
          const other = state.players[otherIndex];
          if (other) {
            io.to(other.socketId).emit("opponent_reconnected", {
              playerName: data.playerName,
            });
          }
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          logger.warn({ err, data }, "Reconnect failed");
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on("new_match", (data: { roomCode: string }) => {
      try {
        const state = getRoom(data.roomCode);
        if (!state) return;
        if (state.phase !== "game_over") return;
        // Only host can start a new match
        if (state.players[0]?.socketId !== socket.id) return;
        // Need both players present
        if (!state.players[0] || !state.players[1]) return;

        // New match → re-toss the coin and broadcast the coin_toss phase
        // for ~3.5s before dealing Round 1 (mirrors `start_game`).
        const reset  = resetMatch(state);
        const tossed = performCoinToss(reset);
        updateRoom(tossed);
        broadcastState(io, tossed);

        setTimeout(() => {
          try {
            const current = getRoom(data.roomCode);
            if (!current || current.phase !== "coin_toss") return;
            const dealt = startRound(current);
            dealWithShuffleAnimation(io, data.roomCode, dealt);
          } catch (err: unknown) {
            logger.error({ err }, "Error dealing first round of new match");
          }
        }, 3500);
      } catch (err: unknown) {
        logger.error({ err }, "Error starting new match");
      }
    });

    socket.on(
      "join_as_spectator",
      (
        data: { roomCode: string; spectatorName: string },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const name = (data.spectatorName || "Spectator").slice(0, 24);
          const state = addSpectator(code, name, socket.id);
          socket.join(code);
          logger.info({ roomCode: code, name }, "Spectator joined");

          callback({ ok: true });
          // Send the spectator their view
          socket.emit("game_state", sanitizeStateForSpectator(state));
          // Refresh everyone else so they see updated spectatorCount
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "reconnect_spectator",
      (
        data: { roomCode: string; spectatorName: string },
        callback: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const name = (data.spectatorName || "Spectator").slice(0, 24);
          const state = reconnectSpectator(code, name, socket.id);
          socket.join(code);
          logger.info({ roomCode: code, name }, "Spectator reconnected");

          callback({ ok: true });
          socket.emit("game_state", sanitizeStateForSpectator(state));
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "set_ready",
      (
        data: { roomCode: string; ready: boolean },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const state = setPlayerReady(code, socket.id, !!data.ready);
          callback?.({ ok: true });
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on(
      "join_queue",
      (
        data: { roomCode: string; name: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const state = addChallenger(code, data.name, socket.id);
          // Ensure the queued spectator is in the socket.io room so they
          // receive room-scoped events (and game_state) immediately.
          socket.join(code);
          logger.info({ roomCode: code, name: data.name }, "Challenger joined queue");
          callback?.({ ok: true });
          broadcastState(io, state);
          // If the room is already in game_over (queue was empty when the
          // match ended), kick off the rotation now that we have a challenger.
          if (state.phase === "game_over" && state.mode === "king") {
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
      (
        data: { roomCode: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const state = removeChallenger(code, socket.id);
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
          const host = (data.hostName || "Host").slice(0, 24);
          const { tournament: t, hostToken } = createTournamentEntity(host, socket.id, {
            name: data.name,
            size: data.size,
            matchTarget: data.matchTarget,
          });
          socket.join(`tournament:${t.code}`);
          logger.info({ code: t.code, host, size: t.size }, "Tournament created");
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
          const code = (data.code || "").toUpperCase().trim();
          const name = (data.name || "").slice(0, 24);
          const { tournament: t, token, joinedFresh } = joinTournamentEntity(code, name, socket.id, data.token);
          socket.join(`tournament:${code}`);
          logger.info({ code, name, joinedFresh }, "Tournament joined");
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

    socket.on(
      "start_tournament",
      (
        data: { code: string; token?: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = (data.code || "").toUpperCase().trim();
          const t = startTournamentEntity(code, socket.id, data.token);
          logger.info({ code, size: t.size }, "Tournament started by host");
          callback?.({ ok: true });
          // Spin up Round 1 rooms for each match, in order.
          for (const match of t.rounds[0]) {
            createMatchRoomAndAssign(io, t, match);
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
      (
        data: { roomCode: string },
        callback?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const code = data.roomCode.toUpperCase().trim();
          const state = resetRoom(code, socket.id);
          logger.info({ roomCode: code }, "Room reset by host");
          callback?.({ ok: true });
          broadcastState(io, state);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          callback?.({ ok: false, error: msg });
        }
      }
    );

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
      const state = removePlayerFromRoom(socket.id);
      if (state) {
        const remaining = state.players.find((p) => p !== null);
        if (remaining) {
          io.to(remaining.socketId).emit("opponent_disconnected", {});
        }
        // Refresh remaining viewers so spectatorCount stays accurate
        broadcastState(io, state);
      }
    });
  });

  return io;
}
