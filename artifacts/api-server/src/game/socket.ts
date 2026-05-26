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
  type GameState,
} from "./engine.js";
import type { Card } from "./deck.js";

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
  };
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
        data: { playerName: string; matchTarget?: number; matchLabel?: string },
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
          const state = createRoom(data.playerName, socket.id, target, label);
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
          updateRoom(dealt);
          broadcastState(io, dealt);
          const firstBidder = dealt.currentBidder;
          for (let i = 0; i < 2; i++) {
            const p = dealt.players[i];
            if (p) {
              io.to(p.socketId).emit("round_started", {
                roundNumber: dealt.roundNumber,
                yourBidTurn: i === firstBidder,
              });
            }
          }
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
        updateRoom(newState);

        const firstBidder = newState.currentBidder;
        broadcastState(io, newState);
        for (let i = 0; i < 2; i++) {
          const p = newState.players[i];
          if (p) {
            io.to(p.socketId).emit("round_started", {
              roundNumber: newState.roundNumber,
              yourBidTurn: i === firstBidder,
            });
          }
        }
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
            updateRoom(dealt);
            const firstBidder = dealt.currentBidder;
            broadcastState(io, dealt);
            for (let i = 0; i < 2; i++) {
              const p = dealt.players[i];
              if (p) {
                io.to(p.socketId).emit("round_started", {
                  roundNumber: dealt.roundNumber,
                  yourBidTurn: i === firstBidder,
                });
              }
            }
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
