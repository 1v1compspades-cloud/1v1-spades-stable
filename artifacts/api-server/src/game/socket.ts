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
  };
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
        data: { playerName: string },
        callback: (res: { ok: boolean; roomCode?: string; playerIndex?: number; error?: string }) => void
      ) => {
        try {
          const state = createRoom(data.playerName, socket.id);
          socket.join(state.roomCode);
          logger.info({ roomCode: state.roomCode, playerName: data.playerName }, "Room created");
          callback({ ok: true, roomCode: state.roomCode, playerIndex: 0 });
          socket.emit("game_state", sanitizeStateForPlayer(state, 0));
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
          socket.emit("game_state", sanitizeStateForPlayer(state, playerIndex));

          // Notify host
          const hostSocket = state.players[0]?.socketId;
          if (hostSocket) {
            io.to(hostSocket).emit("opponent_joined", {
              playerName: data.playerName,
            });
            io.to(hostSocket).emit("game_state", sanitizeStateForPlayer(state, 0));
          }
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

        const newState = startRound(state);
        updateRoom(newState);

        for (let i = 0; i < 2; i++) {
          const p = newState.players[i];
          if (p) {
            io.to(p.socketId).emit("game_state", sanitizeStateForPlayer(newState, i as 0 | 1));
            io.to(p.socketId).emit("round_started", {
              roundNumber: newState.roundNumber,
              yourBidTurn: i === 0,
            });
          }
        }
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

          // Send updated state to both players
          for (let i = 0; i < 2; i++) {
            const p = newState.players[i];
            if (p) {
              io.to(p.socketId).emit("game_state", sanitizeStateForPlayer(newState, i as 0 | 1));
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
          updateRoom(result.state);

          callback({ ok: true });

          // Send updated state to both players
          for (let i = 0; i < 2; i++) {
            const p = result.state.players[i];
            if (p) {
              io.to(p.socketId).emit("game_state", sanitizeStateForPlayer(result.state, i as 0 | 1));
            }
          }

          if (result.trickComplete) {
            io.to(data.roomCode).emit("trick_complete", {
              winner: result.trickWinner,
              tricks: result.state.tricks,
            });
          }

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

        for (let i = 0; i < 2; i++) {
          const p = newState.players[i];
          if (p) {
            io.to(p.socketId).emit("game_state", sanitizeStateForPlayer(newState, i as 0 | 1));
            io.to(p.socketId).emit("round_started", {
              roundNumber: newState.roundNumber,
              yourBidTurn: i === 0,
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
          socket.emit("game_state", sanitizeStateForPlayer(state, data.playerIndex));

          // Notify the other player that their opponent is back
          const otherIndex = data.playerIndex === 0 ? 1 : 0;
          const other = state.players[otherIndex];
          if (other) {
            io.to(other.socketId).emit("opponent_reconnected", {
              playerName: data.playerName,
            });
            // Also refresh their state in case phase was restored
            io.to(other.socketId).emit("game_state", sanitizeStateForPlayer(state, otherIndex));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          logger.warn({ err, data }, "Reconnect failed");
          callback({ ok: false, error: msg });
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
      }
    });
  });

  return io;
}
