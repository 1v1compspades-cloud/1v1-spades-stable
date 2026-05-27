import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, Card, TournamentState, MatchAssignedPayload } from "@/lib/game";

export type SocketStatus = "connecting" | "online" | "reconnecting" | "offline";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  status: SocketStatus;
  gameState: GameState | null;
  error: string | null;
  connect: () => void;
  createRoom: (name: string, matchTarget?: number, matchLabel?: string, mode?: "quick" | "king") => Promise<{ roomCode?: string; playerIndex?: number }>;
  joinRoom: (code: string, name: string) => Promise<{ playerIndex?: number }>;
  reconnect: (roomCode: string, playerIndex: 0 | 1, playerName: string) => Promise<{ ok: boolean }>;
  startGame: (code: string) => void;
  placeBid: (code: string, amount: number) => Promise<void>;
  playCard: (code: string, card: Card) => Promise<void>;
  nextRound: (code: string) => void;
  newMatch: (code: string) => void;
  resetRoom: (code: string) => Promise<void>;
  setReady: (code: string, ready: boolean) => Promise<void>;
  clearGameState: () => void;
  joinAsSpectator: (code: string, name: string) => Promise<void>;
  reconnectAsSpectator: (code: string, name: string) => Promise<void>;
  joinQueue: (code: string, name: string) => Promise<void>;
  leaveQueue: (code: string) => Promise<void>;
  // ── Custom Tournament ──────────────────────────────────────────────────
  tournament: TournamentState | null;
  matchAssignment: MatchAssignedPayload | null;
  tournamentEliminated: { code: string; round: number } | null;
  createTournament: (opts: { hostName: string; name?: string; size: 4 | 8 | 16 | 32; matchTarget: number }) => Promise<{ code: string; token: string }>;
  joinTournament: (code: string, name: string, token?: string) => Promise<{ token: string }>;
  leaveTournament: (code: string) => Promise<void>;
  startTournament: (code: string, token?: string) => Promise<void>;
  subscribeTournament: (code: string, playerName?: string, token?: string) => Promise<{ state: TournamentState; yourMatch: { roomCode: string | null; matchId: string } | null; authenticated: boolean }>;
  clearMatchAssignment: () => void;
  clearTournamentEliminated: () => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<SocketStatus>("offline");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [matchAssignment, setMatchAssignment] = useState<MatchAssignedPayload | null>(null);
  const [tournamentEliminated, setTournamentEliminated] = useState<{ code: string; round: number } | null>(null);

  useEffect(() => {
    const s = io({
      path: "/socket.io",
      autoConnect: false,
      // Automatically retry forever with capped exponential backoff so brief
      // network blips / phone-locks / proxy hiccups don't kill the session.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });
    setSocket(s);

    s.on("connect", () => {
      setConnected(true);
      setStatus("online");
      setError(null);
    });
    s.on("disconnect", () => {
      setConnected(false);
      setStatus("reconnecting");
      // Drop cached gameState so the Room's auto re-attach effect fires once
      // the socket comes back (server has a fresh socketId for us).
      setGameState(null);
    });
    s.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    s.io.on("reconnect", () => setStatus("online"));
    s.io.on("reconnect_error", () => setStatus("reconnecting"));
    s.io.on("reconnect_failed", () => setStatus("offline"));

    s.on("game_state", (state: GameState) => {
      setGameState(state);
      setError(null);
    });

    s.on("opponent_joined", () => {});
    s.on("round_started", () => {});
    s.on("bid_placed", () => {});
    s.on("trick_complete", () => {});
    s.on("round_over", () => {});
    s.on("opponent_disconnected", () => {
      setError("Opponent disconnected. Waiting for them to rejoin...");
    });
    s.on("opponent_reconnected", () => {
      setError(null);
    });

    // ── Tournament listeners ─────────────────────────────────────────────
    s.on("tournament_state", (state: TournamentState) => {
      setTournament(state);
    });
    s.on("match_assigned", (payload: MatchAssignedPayload) => {
      setMatchAssignment(payload);
    });
    s.on("tournament_eliminated", (payload: { tournamentCode: string; round: number }) => {
      setTournamentEliminated({ code: payload.tournamentCode, round: payload.round });
    });
    s.on("tournament_complete", () => {
      // tournament_state will follow with status=complete
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const connect = () => {
    if (socket && !socket.connected) {
      setStatus("connecting");
      socket.connect();
    }
  };

  const createRoom = (playerName: string, matchTarget?: number, matchLabel?: string, mode?: "quick" | "king") => {
    return new Promise<{ roomCode?: string; playerIndex?: number }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("create_room", { playerName, matchTarget, matchLabel, mode }, (res: any) => {
        if (res.ok) resolve({ roomCode: res.roomCode, playerIndex: res.playerIndex });
        else reject(res.error);
      });
    });
  };

  const joinQueue = (roomCode: string, name: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("join_queue", { roomCode, name }, (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(res.error || "Could not join queue");
      });
    });
  };

  const leaveQueue = (roomCode: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("leave_queue", { roomCode }, (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(res.error || "Could not leave queue");
      });
    });
  };

  const joinRoom = (roomCode: string, playerName: string) => {
    return new Promise<{ playerIndex?: number }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("join_room", { roomCode, playerName }, (res: any) => {
        if (res.ok) resolve({ playerIndex: res.playerIndex });
        else reject(res.error);
      });
    });
  };

  const startGame = (roomCode: string) => {
    socket?.emit("start_game", { roomCode });
  };

  const placeBid = (roomCode: string, amount: number) => {
    return new Promise<void>((resolve, reject) => {
      socket?.emit("place_bid", { roomCode, amount }, (res: any) => {
        if (res.ok) resolve();
        else reject(res.error);
      });
    });
  };

  const playCard = (roomCode: string, card: Card) => {
    return new Promise<void>((resolve, reject) => {
      socket?.emit("play_card", { roomCode, card }, (res: any) => {
        if (res.ok) resolve();
        else reject(res.error);
      });
    });
  };

  const reconnect = (roomCode: string, playerIndex: 0 | 1, playerName: string) => {
    return new Promise<{ ok: boolean }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(
        "reconnect_player",
        { roomCode, playerIndex, playerName },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve({ ok: true });
          else reject(res.error);
        }
      );
    });
  };

  const nextRound = (roomCode: string) => {
    socket?.emit("next_round", { roomCode });
  };

  const newMatch = (roomCode: string) => {
    socket?.emit("new_match", { roomCode });
  };

  const resetRoom = (roomCode: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("reset_room", { roomCode }, (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(res.error || "Could not reset room");
      });
    });
  };

  const setReady = (roomCode: string, ready: boolean) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("set_ready", { roomCode, ready }, (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(res.error || "Could not update ready status");
      });
    });
  };

  const clearGameState = () => setGameState(null);

  // ── Tournament actions ───────────────────────────────────────────────────
  const createTournament = (opts: { hostName: string; name?: string; size: 4 | 8 | 16 | 32; matchTarget: number }) => {
    return new Promise<{ code: string; token: string }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("create_tournament", opts, (res: { ok: boolean; code?: string; token?: string; error?: string }) => {
        if (res.ok && res.code && res.token) resolve({ code: res.code, token: res.token });
        else reject(res.error || "Could not create tournament");
      });
    });
  };
  const joinTournament = (code: string, name: string, token?: string) => {
    return new Promise<{ token: string }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("join_tournament", { code, name, token }, (res: { ok: boolean; error?: string; token?: string }) => {
        if (res.ok && res.token) resolve({ token: res.token });
        else reject(res.error || "Could not join tournament");
      });
    });
  };
  const leaveTournament = (code: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("leave_tournament", { code }, (res: { ok: boolean; error?: string }) => {
        if (res.ok) { setTournament(null); resolve(); }
        else reject(res.error || "Could not leave tournament");
      });
    });
  };
  const startTournament = (code: string, token?: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("start_tournament", { code, token }, (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve();
        else reject(res.error || "Could not start tournament");
      });
    });
  };
  const subscribeTournament = (code: string, playerName?: string, token?: string) => {
    return new Promise<{ state: TournamentState; yourMatch: { roomCode: string | null; matchId: string } | null; authenticated: boolean }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(
        "subscribe_tournament",
        { code, playerName, token },
        (res: { ok: boolean; error?: string; state?: TournamentState; yourMatch?: { roomCode: string | null; matchId: string } | null; authenticated?: boolean }) => {
          if (res.ok && res.state) {
            setTournament(res.state);
            resolve({ state: res.state, yourMatch: res.yourMatch ?? null, authenticated: !!res.authenticated });
          } else reject(res.error || "Could not subscribe to tournament");
        }
      );
    });
  };
  const clearMatchAssignment = () => setMatchAssignment(null);
  const clearTournamentEliminated = () => setTournamentEliminated(null);

  const joinAsSpectator = (roomCode: string, spectatorName: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(
        "join_as_spectator",
        { roomCode, spectatorName },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve();
          else reject(res.error);
        }
      );
    });
  };

  const reconnectAsSpectator = (roomCode: string, spectatorName: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(
        "reconnect_spectator",
        { roomCode, spectatorName },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve();
          else reject(res.error);
        }
      );
    });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      status,
      gameState,
      error,
      connect,
      createRoom,
      joinRoom,
      reconnect,
      startGame,
      placeBid,
      playCard,
      nextRound,
      newMatch,
      resetRoom,
      setReady,
      clearGameState,
      joinAsSpectator,
      reconnectAsSpectator,
      joinQueue,
      leaveQueue,
      tournament,
      matchAssignment,
      tournamentEliminated,
      createTournament,
      joinTournament,
      leaveTournament,
      startTournament,
      subscribeTournament,
      clearMatchAssignment,
      clearTournamentEliminated,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
