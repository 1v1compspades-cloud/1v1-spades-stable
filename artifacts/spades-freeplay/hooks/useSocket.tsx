import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { Card, GameState } from "@workspace/spades-core";

// ─────────────────────────────────────────────────────────────────────────────
// Free-play socket layer for the mobile app.
//
// This is a deliberately SMALL subset of the proven web client hook
// (artifacts/spades-game/src/hooks/useSocket.tsx). It speaks ONLY the existing,
// free-play-safe server events — create/join/reconnect a 1v1 room, ready up,
// start, bid, play, advance rounds/matches. It deliberately omits every
// tournament / KotT / admin / spectator / queue event. The SERVER is the sole
// authority for all game rules; nothing here re-implements gameplay logic.
// ─────────────────────────────────────────────────────────────────────────────

export type SocketStatus = "connecting" | "online" | "reconnecting" | "offline";

/**
 * Base server URL. In dev and in published builds the Expo bundler injects
 * EXPO_PUBLIC_DOMAIN (a bare host, protocol stripped). The shared Replit proxy
 * on that host routes `/socket.io` to the existing API server — so the mobile
 * app reuses the exact same backend as the website with no server changes.
 */
function serverUrl(): string | null {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return null;
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}`;
}

interface SocketContextType {
  connected: boolean;
  status: SocketStatus;
  gameState: GameState | null;
  error: string | null;
  clearError: () => void;
  setActiveRoom: (roomCode: string | null) => void;
  clearGameState: () => void;
  createRoom: (
    name: string,
  ) => Promise<{ roomCode: string; playerIndex: 0 | 1; token?: string }>;
  joinRoom: (
    code: string,
    name: string,
  ) => Promise<{ playerIndex: 0 | 1; token?: string }>;
  reconnect: (
    roomCode: string,
    playerIndex: 0 | 1,
    playerName: string,
    token?: string,
  ) => Promise<void>;
  setReady: (code: string, ready: boolean) => Promise<void>;
  startGame: (code: string) => void;
  placeBid: (code: string, amount: number) => Promise<void>;
  playCard: (code: string, card: Card) => Promise<void>;
  nextRound: (code: string) => void;
  newMatch: (code: string) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track which room the user is viewing so a stale/foreign-room broadcast can't
  // clobber the visible state (mirrors the web client's defense-in-depth).
  const activeRoomRef = useRef<string | null>(null);

  const setActiveRoom = useCallback((roomCode: string | null) => {
    const next = roomCode ? roomCode.toUpperCase() : null;
    if (activeRoomRef.current === next) return;
    activeRoomRef.current = next;
    setGameState((prev) => {
      if (!prev) return prev;
      if (!next) return null;
      return (prev.roomCode || "").toUpperCase() === next ? prev : null;
    });
  }, []);

  useEffect(() => {
    const url = serverUrl();
    const s = url
      ? io(url, {
          path: "/socket.io",
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 800,
          reconnectionDelayMax: 4000,
          timeout: 10000,
        })
      : null;

    if (!s) {
      setStatus("offline");
      setError("Server address unavailable.");
      return;
    }

    socketRef.current = s;

    s.on("connect", () => {
      setConnected(true);
      setStatus("online");
      setError(null);
    });
    s.on("disconnect", () => {
      setConnected(false);
      setStatus("reconnecting");
      setGameState(null);
    });
    s.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    s.io.on("reconnect", () => setStatus("online"));
    s.io.on("reconnect_failed", () => setStatus("offline"));

    s.on("game_state", (state: GameState) => {
      const active = activeRoomRef.current;
      const incoming = (state.roomCode || "").toUpperCase();
      if (active && incoming && incoming !== active) return;
      setGameState(state);
      setError(null);
    });

    s.on("opponent_disconnected", () => {
      setError("Opponent disconnected. Waiting for them to rejoin…");
    });
    s.on("opponent_reconnected", () => setError(null));

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const createRoom = useCallback((playerName: string) => {
    return new Promise<{ roomCode: string; playerIndex: 0 | 1; token?: string }>(
      (resolve, reject) => {
        const s = socketRef.current;
        if (!s) return reject(new Error("Not connected"));
        // mode "quick" = standard free 1v1 (the only mode this app uses).
        s.emit(
          "create_room",
          { playerName, mode: "quick" },
          (res: {
            ok: boolean;
            roomCode?: string;
            playerIndex?: number;
            token?: string;
            error?: string;
          }) => {
            if (res.ok && res.roomCode != null && res.playerIndex != null) {
              resolve({
                roomCode: res.roomCode,
                playerIndex: res.playerIndex as 0 | 1,
                token: res.token,
              });
            } else reject(new Error(res.error || "Could not create table"));
          },
        );
      },
    );
  }, []);

  const joinRoom = useCallback((roomCode: string, playerName: string) => {
    return new Promise<{ playerIndex: 0 | 1; token?: string }>(
      (resolve, reject) => {
        const s = socketRef.current;
        if (!s) return reject(new Error("Not connected"));
        s.emit(
          "join_room",
          { roomCode, playerName },
          (res: {
            ok: boolean;
            playerIndex?: number;
            token?: string;
            error?: string;
          }) => {
            if (res.ok && res.playerIndex != null) {
              resolve({
                playerIndex: res.playerIndex as 0 | 1,
                token: res.token,
              });
            } else reject(new Error(res.error || "Could not join table"));
          },
        );
      },
    );
  }, []);

  const reconnect = useCallback(
    (roomCode: string, playerIndex: 0 | 1, playerName: string, token?: string) => {
      return new Promise<void>((resolve, reject) => {
        const s = socketRef.current;
        if (!s) return reject(new Error("Not connected"));
        s.emit(
          "reconnect_player",
          { roomCode, playerIndex, playerName, token },
          (res: { ok: boolean; error?: string }) => {
            if (res.ok) resolve();
            else reject(new Error(res.error || "Could not rejoin table"));
          },
        );
      });
    },
    [],
  );

  const setReady = useCallback((roomCode: string, ready: boolean) => {
    return new Promise<void>((resolve, reject) => {
      const s = socketRef.current;
      if (!s) return reject(new Error("Not connected"));
      s.emit(
        "set_ready",
        { roomCode, ready },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve();
          else reject(new Error(res.error || "Could not update ready status"));
        },
      );
    });
  }, []);

  const startGame = useCallback((roomCode: string) => {
    socketRef.current?.emit("start_game", { roomCode });
  }, []);

  const placeBid = useCallback((roomCode: string, amount: number) => {
    return new Promise<void>((resolve, reject) => {
      const s = socketRef.current;
      if (!s) return reject(new Error("Not connected"));
      s.emit(
        "place_bid",
        { roomCode, amount },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve();
          else reject(new Error(res.error || "Bid rejected"));
        },
      );
    });
  }, []);

  const playCard = useCallback((roomCode: string, card: Card) => {
    return new Promise<void>((resolve, reject) => {
      const s = socketRef.current;
      if (!s) return reject(new Error("Not connected"));
      s.emit(
        "play_card",
        { roomCode, card },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve();
          else reject(new Error(res.error || "Illegal move"));
        },
      );
    });
  }, []);

  const nextRound = useCallback((roomCode: string) => {
    socketRef.current?.emit("next_round", { roomCode });
  }, []);

  const newMatch = useCallback((roomCode: string) => {
    socketRef.current?.emit("new_match", { roomCode });
  }, []);

  const clearGameState = useCallback(() => setGameState(null), []);
  const clearError = useCallback(() => setError(null), []);

  const value: SocketContextType = {
    connected,
    status,
    gameState,
    error,
    clearError,
    setActiveRoom,
    clearGameState,
    createRoom,
    joinRoom,
    reconnect,
    setReady,
    startGame,
    placeBid,
    playCard,
    nextRound,
    newMatch,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within a SocketProvider");
  return ctx;
}
