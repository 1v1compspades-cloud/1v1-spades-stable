import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, Card, TournamentState, MatchAssignedPayload, TournamentDisconnectNotice, AdminAuditEntry, AdminDashboardSnapshot } from "@/lib/game";

export type SocketStatus = "connecting" | "online" | "reconnecting" | "offline";

// SECURITY: the admin unlock lives ONLY in sessionStorage (cleared when the tab
// closes), never localStorage, links, or shared state. It holds an opaque,
// server-issued resume token — NEVER the secret admin key itself.
const ADMIN_SESSION_KEY = "spades_admin_session";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  status: SocketStatus;
  gameState: GameState | null;
  error: string | null;
  connect: () => void;
  createRoom: (name: string, matchTarget?: number, matchLabel?: string, mode?: "quick" | "king") => Promise<{ roomCode?: string; playerIndex?: number; token?: string }>;
  joinRoom: (code: string, name: string) => Promise<{ playerIndex?: number; token?: string }>;
  reconnect: (roomCode: string, playerIndex: 0 | 1, playerName: string, token?: string) => Promise<{ ok: boolean }>;
  startGame: (code: string) => void;
  placeBid: (code: string, amount: number) => Promise<void>;
  playCard: (code: string, card: Card) => Promise<void>;
  nextRound: (code: string) => void;
  newMatch: (code: string) => void;
  resetRoom: (code: string) => Promise<void>;
  setReady: (code: string, ready: boolean) => Promise<void>;
  clearGameState: () => void;
  /**
   * Tell the socket layer which room URL the user is currently viewing.
   * Foreign-room `game_state` broadcasts (e.g., a completed tournament match
   * still pushing updates to a socket that was joined to two rooms at once)
   * are dropped instead of clobbering the visible state.
   */
  setActiveRoom: (roomCode: string | null) => void;
  joinAsSpectator: (code: string, name: string) => Promise<void>;
  reconnectAsSpectator: (code: string, name: string) => Promise<void>;
  joinQueue: (code: string, name: string) => Promise<void>;
  leaveQueue: (code: string) => Promise<void>;
  // ── Custom Tournament ──────────────────────────────────────────────────
  tournament: TournamentState | null;
  matchAssignment: MatchAssignedPayload | null;
  tournamentEliminated: { code: string; round: number } | null;
  tournamentNotice: TournamentDisconnectNotice | null;
  createTournament: (opts: { name?: string; size: 4 | 8 | 16 | 32; matchTarget: number }) => Promise<{ code: string }>;
  joinTournament: (code: string, name: string, token?: string) => Promise<{ token: string }>;
  leaveTournament: (code: string) => Promise<void>;
  startTournament: (code: string) => Promise<void>;
  subscribeTournament: (code: string, playerName?: string, token?: string) => Promise<{ state: TournamentState; yourMatch: { roomCode: string | null; matchId: string } | null; authenticated: boolean }>;
  forceForfeitMatch: (code: string, matchId: string, forfeitSeat: "A" | "B") => Promise<void>;
  clearMatchAssignment: () => void;
  clearTournamentEliminated: () => void;
  clearTournamentNotice: () => void;
  // ── Admin identity (tournaments are admin-only) ───────────────────────
  // `isAdmin` is true only after this socket proved the secret key (or resumed
  // a valid session token). `adminChecked` flips true once the initial resume
  // attempt resolves, so UI can avoid bouncing before the check completes.
  isAdmin: boolean;
  adminChecked: boolean;
  unlockAdmin: (key: string) => Promise<void>;
  // ── Host admin tools ──────────────────────────────────────────────────
  // No token args: admin actions are authorized server-side by the unlocked
  // socket (requireAdmin), never by a client-passed token.
  adminDashboard: (code: string) => Promise<AdminDashboardSnapshot>;
  adminAuditLog: (code: string, limit?: number) => Promise<AdminAuditEntry[]>;
  adminPauseMatch: (code: string, matchId: string) => Promise<unknown>;
  adminResumeMatch: (code: string, matchId: string) => Promise<unknown>;
  adminResetTimer: (code: string, matchId: string) => Promise<unknown>;
  adminRemakeRoom: (code: string, matchId: string) => Promise<{ ok: true; newRoomCode?: string }>;
  adminMarkWinner: (code: string, matchId: string, winnerSeat: "A" | "B") => Promise<{ ok: true; replay?: boolean }>;
  adminForceForfeit: (code: string, matchId: string, forfeitSeat: "A" | "B") => Promise<unknown>;
  hostReplacePlayer: (code: string, oldName: string, newName: string) => Promise<{ ok: true; newPlayerToken: string; removedName: string; replacementName: string }>;
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
  const [tournamentNotice, setTournamentNotice] = useState<TournamentDisconnectNotice | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  // Pre-June-1 fix: after a tournament match finishes, the winner's socket is
  // joined to BOTH the completed match room AND the freshly-created next-round
  // room (server-side `socket.join(newRoomCode)` in createMatchRoomAndAssign).
  // Any subsequent broadcast to either room would clobber the visible state,
  // causing the "flash to Ready Up, then back to Game Over" symptom users hit
  // during the SF2 → Finals transition. We track the URL room the user is
  // viewing and drop foreign-room game_state events at the boundary.
  const activeRoomRef = useRef<string | null>(null);

  const setActiveRoom = useCallback((roomCode: string | null) => {
    const next = roomCode ? roomCode.toUpperCase() : null;
    if (activeRoomRef.current === next) return;
    activeRoomRef.current = next;
    // Wipe stale state from the previous room so the Room component's
    // re-attach effect (which gates on `!gameState`) fires for the new room
    // instead of rendering the old room's last frame.
    setGameState((prev) => {
      if (!prev) return prev;
      if (!next) return null;
      const prevCode = (prev.roomCode || "").toUpperCase();
      return prevCode === next ? prev : null;
    });
  }, []);

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
      // Re-assert admin status on every (re)connect. A new socket id means a
      // fresh server-side admin binding, so we resume from the opaque session
      // token kept in sessionStorage. The secret key is NEVER stored or resent.
      let adminToken: string | null = null;
      try { adminToken = sessionStorage.getItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
      if (adminToken) {
        s.emit("admin_resume", { sessionToken: adminToken }, (res: { ok?: boolean }) => {
          const ok = !!res?.ok;
          setIsAdmin(ok);
          if (!ok) { try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ } }
          setAdminChecked(true);
        });
      } else {
        setIsAdmin(false);
        setAdminChecked(true);
      }
    });
    s.on("disconnect", () => {
      setConnected(false);
      setStatus("reconnecting");
      // Drop cached gameState so the Room's auto re-attach effect fires once
      // the socket comes back (server has a fresh socketId for us).
      setGameState(null);
      // SECURITY: a disconnected socket is no longer bound as admin server-side.
      // Drop isAdmin AND reset adminChecked so no admin-only UI renders during
      // the reconnect window — the connect handler re-runs admin_resume and only
      // re-grants admin once the server re-validates the opaque session token.
      setIsAdmin(false);
      setAdminChecked(false);
    });
    s.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    s.io.on("reconnect", () => setStatus("online"));
    s.io.on("reconnect_error", () => setStatus("reconnecting"));
    s.io.on("reconnect_failed", () => setStatus("offline"));

    s.on("game_state", (state: GameState) => {
      const active = activeRoomRef.current;
      const incoming = (state.roomCode || "").toUpperCase();
      // Defense-in-depth: if the component layer has declared an active room
      // and this broadcast is for a different room, drop it. This prevents
      // a completed tournament match (whose socket.io membership we never
      // tore down) from overwriting the Finals room view.
      if (active && incoming && incoming !== active) {
        return;
      }
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
    s.on("tournament_player_disconnected", (payload: TournamentDisconnectNotice) => {
      setTournamentNotice(payload);
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
    return new Promise<{ roomCode?: string; playerIndex?: number; token?: string }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("create_room", { playerName, matchTarget, matchLabel, mode }, (res: any) => {
        if (res.ok) resolve({ roomCode: res.roomCode, playerIndex: res.playerIndex, token: res.token });
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
    return new Promise<{ playerIndex?: number; token?: string }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("join_room", { roomCode, playerName }, (res: any) => {
        if (res.ok) resolve({ playerIndex: res.playerIndex, token: res.token });
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

  const reconnect = (roomCode: string, playerIndex: 0 | 1, playerName: string, token?: string) => {
    return new Promise<{ ok: boolean }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(
        "reconnect_player",
        { roomCode, playerIndex, playerName, token },
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
  const createTournament = (opts: { name?: string; size: 4 | 8 | 16 | 32; matchTarget: number }) => {
    return new Promise<{ code: string }>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("create_tournament", opts, (res: { ok: boolean; code?: string; error?: string }) => {
        if (res.ok && res.code) resolve({ code: res.code });
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
  const startTournament = (code: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("start_tournament", { code }, (res: { ok: boolean; error?: string }) => {
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
  const forceForfeitMatch = (code: string, matchId: string, forfeitSeat: "A" | "B") => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(
        "tournament_force_forfeit",
        { code, matchId, forfeitSeat },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) resolve();
          else reject(res.error || "Could not force forfeit");
        }
      );
    });
  };
  const clearMatchAssignment = () => setMatchAssignment(null);
  const clearTournamentEliminated = () => setTournamentEliminated(null);
  const clearTournamentNotice = () => setTournamentNotice(null);

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

  // ── Admin unlock ────────────────────────────────────────────────────────
  // Proves the secret admin key to the server ONCE. The key is sent only in
  // this call and never persisted. On success the server returns an opaque
  // resume token, which we stash in sessionStorage (tab-scoped). isAdmin flips
  // true; the server is the auth-of-record for every subsequent admin action.
  const unlockAdmin = (key: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit("admin_unlock", { key }, (res: { ok: boolean; sessionToken?: string; error?: string }) => {
        if (res?.ok && res.sessionToken) {
          try { sessionStorage.setItem(ADMIN_SESSION_KEY, res.sessionToken); } catch { /* ignore */ }
          setIsAdmin(true);
          setAdminChecked(true);
          resolve();
        } else {
          reject(res?.error || "Invalid admin key");
        }
      });
    });
  };

  // ── Host admin tools (tournament) ───────────────────────────────────────
  // No token args: the server authorizes these by the unlocked socket
  // (requireAdmin), never by a client-passed token. An un-unlocked socket is
  // rejected server-side regardless of payload.
  function adminCall<T = void>(event: string, payload: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!socket) return reject("No socket");
      socket.emit(event, payload, (res: { ok: boolean; error?: string } & Record<string, unknown>) => {
        if (res?.ok) resolve(res as unknown as T);
        else reject(res?.error || `${event} failed`);
      });
    });
  }
  const adminDashboard = (code: string) =>
    adminCall<{ ok: true; snapshot: AdminDashboardSnapshot }>("admin_dashboard", { code }).then((r) => r.snapshot);
  const adminAuditLog = (code: string, limit = 100) =>
    adminCall<{ ok: true; entries: AdminAuditEntry[] }>("admin_audit_log", { code, limit }).then((r) => r.entries);
  const adminPauseMatch = (code: string, matchId: string) =>
    adminCall("admin_pause_match", { code, matchId });
  const adminResumeMatch = (code: string, matchId: string) =>
    adminCall("admin_resume_match", { code, matchId });
  const adminResetTimer = (code: string, matchId: string) =>
    adminCall("admin_reset_timer", { code, matchId });
  const adminRemakeRoom = (code: string, matchId: string) =>
    adminCall<{ ok: true; newRoomCode?: string }>("admin_remake_room", { code, matchId });
  const adminMarkWinner = (code: string, matchId: string, winnerSeat: "A" | "B") =>
    adminCall<{ ok: true; replay?: boolean }>("admin_mark_winner", { code, matchId, winnerSeat });
  const adminForceForfeit = (code: string, matchId: string, forfeitSeat: "A" | "B") =>
    adminCall("admin_force_forfeit", { code, matchId, forfeitSeat });
  const hostReplacePlayer = (code: string, oldName: string, newName: string) =>
    adminCall<{ ok: true; newPlayerToken: string; removedName: string; replacementName: string }>(
      "host_replace_player",
      { code, oldName, newName },
    );

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
      setActiveRoom,
      joinAsSpectator,
      reconnectAsSpectator,
      joinQueue,
      leaveQueue,
      tournament,
      matchAssignment,
      tournamentEliminated,
      tournamentNotice,
      createTournament,
      joinTournament,
      leaveTournament,
      startTournament,
      subscribeTournament,
      forceForfeitMatch,
      clearMatchAssignment,
      clearTournamentEliminated,
      clearTournamentNotice,
      isAdmin,
      adminChecked,
      unlockAdmin,
      adminDashboard,
      adminAuditLog,
      adminPauseMatch,
      adminResumeMatch,
      adminResetTimer,
      adminRemakeRoom,
      adminMarkWinner,
      adminForceForfeit,
      hostReplacePlayer,
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
