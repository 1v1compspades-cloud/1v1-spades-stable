import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, Card } from "@/lib/game";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  gameState: GameState | null;
  error: string | null;
  connect: () => void;
  createRoom: (name: string) => Promise<{ roomCode?: string; playerIndex?: number }>;
  joinRoom: (code: string, name: string) => Promise<{ playerIndex?: number }>;
  startGame: (code: string) => void;
  placeBid: (code: string, amount: number) => Promise<void>;
  playCard: (code: string, card: Card) => Promise<void>;
  nextRound: (code: string) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = io({ path: "/socket.io", autoConnect: false });
    setSocket(s);

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    
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
      setError("Opponent disconnected.");
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const connect = () => {
    if (socket && !socket.connected) {
      socket.connect();
    }
  };

  const createRoom = (playerName: string) => {
    return new Promise<{ roomCode?: string; playerIndex?: number }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("create_room", { playerName }, (res: any) => {
        if (res.ok) resolve({ roomCode: res.roomCode, playerIndex: res.playerIndex });
        else reject(res.error);
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

  const nextRound = (roomCode: string) => {
    socket?.emit("next_round", { roomCode });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      gameState,
      error,
      connect,
      createRoom,
      joinRoom,
      startGame,
      placeBid,
      playCard,
      nextRound
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
