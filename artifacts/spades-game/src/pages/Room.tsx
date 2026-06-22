import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { CardComponent } from "@/components/Card";
import { ShuffleOverlay } from "@/components/ShuffleOverlay";
import { isCardPlayable, sortHandBySuit, SUIT_SYMBOLS, SUIT_COLORS } from "@/lib/game";
import { shouldClearSavedReconnectAfterFailure } from "@/lib/reconnectSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card as CardType, Suit } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Safely format any card-like value (object {rank,suit} or plain string)
 * into a compact display like "A♠" or "10♥".
 */
function formatCard(card: unknown): string {
  if (card == null) return "None";
  if (typeof card === "string") return card;
  if (typeof card === "object") {
    const c = card as { rank?: string; value?: string; suit?: string };
    const rank = c.rank ?? c.value ?? "";
    const suit = c.suit ? (SUIT_SYMBOLS[c.suit as Suit] ?? c.suit) : "";
    return `${rank}${suit}`;
  }
  return String(card);
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PreGameChecklist } from "@/components/PreGameChecklist";
import { TabConflictOverlay } from "@/components/TabConflictOverlay";
import { useTabGuard } from "@/hooks/useTabGuard";

const READY_START_COUNTDOWN_SECONDS = 5;
const ROUND_OVER_NEXT_COUNTDOWN_SECONDS = 10;
const COIN_TOSS_REVEAL_DELAY_MS = 2850;

/**
 * Live active-turn AFK countdown. Warnings appear after 60s and 90s of
 * inactivity; the server auto-forfeits the actor at 120s if the turn has not
 * changed.
 */
function TurnTimerBar({ deadline, total, label }: { deadline: number; total: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(h);
  }, []);
  const remaining = Math.max(0, deadline - now);
  const elapsed = Math.max(0, total - remaining);
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const seconds = Math.ceil(remaining / 1000);
  const finalWarning = elapsed >= 90_000;
  const firstWarning = elapsed >= 60_000;
  const urgent = finalWarning || remaining < 10_000;
  const warningText = finalWarning
    ? "Final AFK warning — auto-forfeit at 120 seconds"
    : firstWarning
      ? "AFK warning — make your move"
      : null;
  return (
    <div className="px-4 py-1 bg-black/30" data-testid="turn-timer-bar">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className={urgent ? "text-destructive font-semibold" : "text-muted-foreground"}>
          {seconds}s
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${urgent ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {warningText && (
        <div
          className={`mt-1 text-center text-[11px] font-semibold uppercase tracking-wider ${finalWarning ? "text-destructive" : "text-yellow-300"}`}
          data-testid={finalWarning ? "afk-final-warning" : "afk-first-warning"}
        >
          {warningText}
        </div>
      )}
    </div>
  );
}

export default function Room() {
  const [, params] = useRoute("/room/:roomCode");
  const [, setLocation] = useLocation();
  const roomCode = params?.roomCode;

  // Honour a "?spectator=1" query flag on the URL. Used by the tournament
  // bracket's "Watch Live" link so a viewer can drop straight into a live
  // match without going through the lobby. Pure URL hint — the server is
  // still the source of truth: spectators are added to `state.spectators[]`
  // and all broadcasts use `sanitizeStateForSpectator` (no hands, no raw
  // state), and seat-gated actions reject anyone not in `players[]`.
  const wantsSpectate = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("spectator") === "1";
  })();
  const reconnectSeatFromUrl = (() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reconnect") !== "1") return null;
    const seat = params.get("seat");
    return seat === "0" || seat === "1" ? (Number(seat) as 0 | 1) : null;
  })();

  const {
    socket,
    connected, status, gameState, error, connect, joinRoom, reconnect,
    startGame, placeBid, playCard, nextRound,
    resetRoom: doResetRoom,
    setReady: doSetReady,
    clearGameState,
    joinAsSpectator,
    reconnectAsSpectator,
    leaveRoom,
    joinQueue, leaveQueue, kottStepDown,
    forfeitMatch,
    fastFinishMatch,
    setActiveRoom,
    isAdmin,
    adminResetTable, adminRemoveFromQueue, adminSetNextChallenger,
  } = useSocket();
  const {
    playerName,
    roomCode: storedRoomCode,
    playerIndex, isSpectator,
    savePlayerName,
    saveRoomCode, savePlayerIndex, saveIsSpectator,
    clearStorage,
    getPlayerToken, savePlayerToken, clearPlayerToken, clearPersistedRoomSession,
  } = useGameStorage();
  const { toast } = useToast();

  const [bidAmount, setBidAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [forfeitConfirmOpen, setForfeitConfirmOpen] = useState(false);
  const [spectatorNameInput, setSpectatorNameInput] = useState<string>("");
  // Dev/host Fast Finish test tool: opens a confirm overlay with a winner pick.
  const [fastFinishOpen, setFastFinishOpen] = useState(false);
  const [fastFinishing, setFastFinishing] = useState(false);

  // Per-round skip for the deal animation. Intentionally NOT persisted: each new
  // round re-shows the teaching deal unless the player skips it again. Pure
  // client visual state — has no effect on game/socket/server logic.
  const [dealSkipped, setDealSkipped] = useState(false);
  const [coinTossRevealed, setCoinTossRevealed] = useState(false);

  useEffect(() => {
    if (gameState?.phase !== "coin_toss" || gameState.coinFlipWinner === null) {
      setCoinTossRevealed(false);
      return;
    }

    setCoinTossRevealed(false);
    const timeout = window.setTimeout(() => {
      setCoinTossRevealed(true);
    }, COIN_TOSS_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [gameState?.phase, gameState?.coinFlipWinner]);
  useEffect(() => {
    if (gameState?.phase === "shuffling") setDealSkipped(false);
  }, [gameState?.phase]);
  const [readyStartCountdown, setReadyStartCountdown] = useState<number | null>(null);
  const readyAutoStartKeyRef = useRef<string | null>(null);
  const [roundNextCountdown, setRoundNextCountdown] = useState<number | null>(null);
  const roundAutoNextKeyRef = useRef<string | null>(null);
  const completedSessionCleanupKeyRef = useRef<string | null>(null);
  const [reconnectRetryTick, setReconnectRetryTick] = useState(0);
  const reconnectRetryCountRef = useRef(0);
  const reconnectRetryTimeoutRef = useRef<number | null>(null);
  const latestGamePhaseRef = useRef<string | null>(null);

  useEffect(() => {
    latestGamePhaseRef.current = gameState?.phase ?? null;
  }, [gameState?.phase]);

  const clearReconnectRetry = () => {
    if (reconnectRetryTimeoutRef.current !== null) {
      window.clearTimeout(reconnectRetryTimeoutRef.current);
      reconnectRetryTimeoutRef.current = null;
    }
    reconnectRetryCountRef.current = 0;
  };

  // Tick every 15s so AFK indicators re-render without depending on socket events.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const isHost = !isSpectator && playerIndex === 0;
  const spectator = !!gameState?.isSpectator || isSpectator;

  useEffect(() => {
    if (!roomCode || !gameState || gameState.mode === "king") return;

    const cleanupKey = `${roomCode}:${gameState.roundNumber}:completed`;
    if (gameState.phase === "game_over") {
      if (!spectator && completedSessionCleanupKeyRef.current !== cleanupKey) {
        completedSessionCleanupKeyRef.current = cleanupKey;
      }
      return;
    }
  }, [
    roomCode,
    gameState?.phase,
    gameState?.mode,
    gameState?.roundNumber,
    gameState?.tournamentRef?.code,
    spectator,
  ]);

  useEffect(() => {
    if (gameState || !roomCode || playerIndex === null || isSpectator) {
      clearReconnectRetry();
    }
  }, [gameState, roomCode, playerIndex, isSpectator]);

  useEffect(() => clearReconnectRetry, []);

  useEffect(() => {
    if (!roomCode || !gameState || gameState.phase !== "waiting") {
      setReadyStartCountdown(null);
      readyAutoStartKeyRef.current = null;
      return;
    }

    const bothPresent = !!gameState.players[0] && !!gameState.players[1];
    const bothReady = bothPresent && !!gameState.ready?.[0] && !!gameState.ready?.[1];

    if (!bothReady) {
      setReadyStartCountdown(null);
      readyAutoStartKeyRef.current = null;
      return;
    }

    setReadyStartCountdown((current) => current ?? READY_START_COUNTDOWN_SECONDS);
  }, [
    roomCode,
    gameState?.phase,
    gameState?.players[0]?.name,
    gameState?.players[1]?.name,
    gameState?.ready?.[0],
    gameState?.ready?.[1],
  ]);

  useEffect(() => {
    if (readyStartCountdown === null || readyStartCountdown <= 0) return;
    const id = window.setTimeout(() => {
      setReadyStartCountdown((current) => (
        current === null ? null : Math.max(0, current - 1)
      ));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [readyStartCountdown]);

  useEffect(() => {
    if (!roomCode || !gameState || gameState.phase !== "waiting") return;
    if (readyStartCountdown !== 0) return;

    const bothPresent = !!gameState.players[0] && !!gameState.players[1];
    const bothReady = bothPresent && !!gameState.ready?.[0] && !!gameState.ready?.[1];
    if (!bothReady) return;

    const isTournamentMatch = !!gameState.tournamentRef;
    const canAutoStart = isTournamentMatch ? playerIndex === 0 : isHost;
    if (!canAutoStart) return;

    const startKey = `${roomCode}:${gameState.roundNumber}:waiting`;
    if (readyAutoStartKeyRef.current === startKey) return;
    readyAutoStartKeyRef.current = startKey;
    startGame(roomCode);
  }, [
    readyStartCountdown,
    roomCode,
    gameState?.phase,
    gameState?.roundNumber,
    gameState?.players[0]?.name,
    gameState?.players[1]?.name,
    gameState?.ready?.[0],
    gameState?.ready?.[1],
    gameState?.tournamentRef,
    isHost,
    playerIndex,
    startGame,
  ]);

  useEffect(() => {
    if (!roomCode || !gameState || gameState.phase !== "round_over") {
      setRoundNextCountdown(null);
      roundAutoNextKeyRef.current = null;
      return;
    }

    setRoundNextCountdown((current) => current ?? ROUND_OVER_NEXT_COUNTDOWN_SECONDS);
  }, [
    roomCode,
    gameState?.phase,
    gameState?.roundNumber,
  ]);

  useEffect(() => {
    if (roundNextCountdown === null || roundNextCountdown <= 0) return;
    const id = window.setTimeout(() => {
      setRoundNextCountdown((current) => (
        current === null ? null : Math.max(0, current - 1)
      ));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [roundNextCountdown]);

  useEffect(() => {
    if (!roomCode || !gameState || gameState.phase !== "round_over") return;
    if (roundNextCountdown !== 0) return;
    if (isSpectator || playerIndex !== 0) return;

    const nextKey = `${roomCode}:${gameState.roundNumber}:round_over`;
    if (roundAutoNextKeyRef.current === nextKey) return;
    roundAutoNextKeyRef.current = nextKey;
    nextRound(roomCode);
  }, [
    roundNextCountdown,
    roomCode,
    gameState?.phase,
    gameState?.roundNumber,
    isSpectator,
    playerIndex,
    nextRound,
  ]);

  // Old-tab protection: if this same browser opens the same room in another
  // tab, the newer tab wins and this (older) tab is flagged superseded so we
  // can pause it and avoid confusing double-state. Pure client UX — the server
  // already rebinds the seat to the most-recent socket on reconnect.
  const { superseded: tabSuperseded, reclaim: reclaimTab } = useTabGuard(
    roomCode ? `room:${roomCode.toUpperCase()}` : null,
  );

  // KotT: react to server-driven role swaps. When a spectator is promoted
  // out of the challenger queue into a player seat, the server emits
  // `you_are_seated`. The displaced player gets `you_are_unseated`.
  // We must sync local storage so a refresh doesn't put them back in the
  // wrong role.
  useEffect(() => {
    if (!socket) return;
    const onSeated = (data: { roomCode: string; playerIndex: 0 | 1 }) => {
      if (data.roomCode !== roomCode) return;
      savePlayerIndex(data.playerIndex);
      saveIsSpectator(false);
      toast({ description: "You're up! You've been seated as a player." });
    };
    const onUnseated = (data: { roomCode: string }) => {
      if (data.roomCode !== roomCode) return;
      savePlayerIndex(null);
      saveIsSpectator(true);
      toast({
        description: "Match over — you're now spectating. Tap 'Join as Challenger' to play again.",
      });
    };
    socket.on("you_are_seated", onSeated);
    socket.on("you_are_unseated", onUnseated);
    return () => {
      socket.off("you_are_seated", onSeated);
      socket.off("you_are_unseated", onUnseated);
    };
  }, [socket, roomCode, savePlayerIndex, saveIsSpectator, toast]);

  useEffect(() => {
    if (!roomCode) { setLocation("/"); return; }
    if (!connected) connect();
  }, [roomCode, connected, connect, setLocation]);

  useEffect(() => {
    if (!roomCode || reconnectSeatFromUrl === null || wantsSpectate) return;
    const token = getPlayerToken(roomCode, reconnectSeatFromUrl);
    if (!token) {
      if (latestGamePhaseRef.current === "game_over") return;
      toast({ description: "Reconnect token missing. Please rejoin.", variant: "destructive" });
      setLocation("/");
      return;
    }
    if (storedRoomCode !== roomCode) saveRoomCode(roomCode);
    if (playerIndex !== reconnectSeatFromUrl) savePlayerIndex(reconnectSeatFromUrl);
    if (isSpectator) saveIsSpectator(false);
  }, [
    roomCode,
    reconnectSeatFromUrl,
    wantsSpectate,
    storedRoomCode,
    playerIndex,
    isSpectator,
    getPlayerToken,
    saveRoomCode,
    savePlayerIndex,
    saveIsSpectator,
    setLocation,
    toast,
  ]);

  // Pre-June-1 fix: declare which room URL we're viewing so useSocket can
  // drop foreign-room game_state broadcasts. Without this, a completed
  // tournament match room (whose socket.io membership we never tore down)
  // can clobber the new room's state — causing the "flash to Ready Up,
  // then back to Game Over" symptom during the SF2 → Finals transition.
  useEffect(() => {
    if (!roomCode) return;
    setActiveRoom(roomCode);
    return () => setActiveRoom(null);
  }, [roomCode, setActiveRoom]);

  // Pre-June-1 bugfix #1: remember which tournament this room belongs to,
  // so the "Back" button on the reconnecting screen (where gameState is null)
  // can still route back to the bracket page instead of dumping the user at
  // the public lobby. Written every time we observe a tournamentRef on
  // gameState; never cleared until a brand-new (non-tournament) room is
  // entered (the stale-room guard above handles that case implicitly).
  useEffect(() => {
    if (!roomCode || typeof window === "undefined") return;
    const tCode = gameState?.tournamentRef?.code;
    const key = `spades_room_tournament_${roomCode}`;
    if (tCode) {
      window.localStorage.setItem(key, tCode);
    } else if (gameState && !gameState.tournamentRef) {
      // We have a confirmed non-tournament state for this room — clear any
      // stale mapping so room-code reuse can't misroute a future Back press.
      window.localStorage.removeItem(key);
    }
  }, [roomCode, gameState, gameState?.tournamentRef?.code]);

  // Stale-room-code guard: if the URL room differs from the last room we
  // stored, drop the cached seat / spectator flag so we don't blindly call
  // reconnect() with someone else's seat index for a room we've never been in.
  // If the URL carries `?spectator=1` (Watch Live from the tournament
  // bracket), force the spectator flag on AFTER the wipe so we never
  // accidentally try to take a player seat.
  useEffect(() => {
    if (!roomCode) return;
    if (storedRoomCode && storedRoomCode !== roomCode) {
      savePlayerIndex(null);
      saveIsSpectator(false);
    }
    if (storedRoomCode !== roomCode) {
      saveRoomCode(roomCode);
    }
    if (wantsSpectate) {
      savePlayerIndex(null);
      saveIsSpectator(true);
    }
  }, [roomCode, storedRoomCode, wantsSpectate, saveRoomCode, savePlayerIndex, saveIsSpectator]);

  useEffect(() => {
    if (!connected || !roomCode || !playerName || gameState) return;
    // Old-tab guard: a superseded (stale) tab must NOT auto-reconnect/rejoin —
    // otherwise it would silently reclaim the seat from the newer tab during a
    // reconnect window, defeating "prefer newest tab". The user can still take
    // over via the overlay's "Use this tab instead" (which calls reclaim()).
    if (tabSuperseded) return;
    // Wait for the stale-room-code guard above to settle before attempting
    // any join/reconnect — otherwise we might fire with a stale playerIndex
    // from a previous room.
    if (storedRoomCode !== roomCode) return;
    if (reconnectSeatFromUrl !== null && playerIndex !== reconnectSeatFromUrl) return;
    if (isSpectator) {
      // Fresh spectate via `?spectator=1` has no prior session, so the
      // `reconnect_spectator` handler would reject. Use `join_as_spectator`
      // for first-time entry; fall back to reconnect on later refreshes
      // (which will already have a spectator record on the server).
      const spectateCall = wantsSpectate
        ? joinAsSpectator(roomCode, playerName)
        : reconnectAsSpectator(roomCode, playerName);
      spectateCall.catch(err => {
        if (latestGamePhaseRef.current === "game_over") return;
        toast({ description: err || "Spectator session expired.", variant: "destructive" });
        saveIsSpectator(false);
        setLocation("/");
      });
    } else if (playerIndex !== null) {
      const token = getPlayerToken(roomCode, playerIndex) || undefined;
      reconnect(roomCode, playerIndex, playerName, token).catch(err => {
        if (latestGamePhaseRef.current === "game_over") return;
        const msg = typeof err === "string" ? err : (err?.message ?? "");
        const tournamentCode =
          typeof window !== "undefined"
            ? window.localStorage.getItem(`spades_room_tournament_${roomCode}`)
            : null;
        if (/seat already active in another tab/i.test(msg)) {
          if (reconnectRetryCountRef.current < 20) {
            if (reconnectRetryTimeoutRef.current === null) {
              reconnectRetryCountRef.current += 1;
              reconnectRetryTimeoutRef.current = window.setTimeout(() => {
                reconnectRetryTimeoutRef.current = null;
                setReconnectRetryTick(tick => tick + 1);
              }, 1500);
            }
            return;
          }
          toast({
            description: "That seat is still active in another tab. Close the old tab, then try Reconnect again.",
            variant: "destructive",
          });
          return;
        }
        // Self-heal: "Room not found" means our cached room code is from a
        // finished round that's already been cleaned up. Instead of dumping the
        // player at the public lobby, route back through the tournament page —
        // it re-subscribes and the server re-emits match_assigned for our
        // CURRENT match, landing us back in our live seat. Keep the token: it's
        // still valid for the live room.
        if (/room not found/i.test(msg) && tournamentCode) {
          setLocation(`/tournament/${tournamentCode}`);
          return;
        }
        if (/room not found/i.test(msg)) {
          clearPersistedRoomSession(roomCode);
          clearReconnectRetry();
          toast({ description: "Previous room was closed. You can create or join again." });
          setLocation("/");
          return;
        }
        if (!tournamentCode && shouldClearSavedReconnectAfterFailure(msg)) {
          clearPersistedRoomSession(roomCode);
          clearReconnectRetry();
          toast({ description: "Saved reconnect cleared. You can start or join a fresh match." });
          setLocation("/");
          return;
        }

        toast({ description: err || "Session expired. Please rejoin.", variant: "destructive" });
        // Only a genuine token mismatch is terminal for this browser. Safari
        // can briefly report the old socket as active after a disconnect; keep
        // the token so Home can still offer Reconnect once the socket settles.
        if (/held by another player|token invalid/i.test(msg)) {
          clearPlayerToken(roomCode, playerIndex);
        }
        setLocation(tournamentCode ? `/tournament/${tournamentCode}` : "/");
      });
    } else {
      joinRoom(roomCode, playerName).then((res) => {
        if (res.playerIndex !== undefined) {
          savePlayerIndex(res.playerIndex as 0 | 1);
          if (res.token) savePlayerToken(roomCode, res.playerIndex as 0 | 1, res.token);
        }
      }).catch(err => {
        if (latestGamePhaseRef.current === "game_over") return;
        toast({ description: err || "Failed to join room", variant: "destructive" });
        setLocation("/");
      });
    }
  }, [connected, roomCode, storedRoomCode, playerName, gameState, playerIndex, isSpectator, wantsSpectate, reconnectSeatFromUrl, reconnectRetryTick, tabSuperseded, reconnect, reconnectAsSpectator, joinAsSpectator, joinRoom, setLocation, savePlayerIndex, saveIsSpectator, toast, getPlayerToken, savePlayerToken, clearPlayerToken]);

  // Old-tab guard: a newer tab opened this same room → pause this stale tab.
  if (tabSuperseded) {
    return (
      <TabConflictOverlay
        scopeLabel="room"
        onUseHere={reclaimTab}
        onLeave={() => setLocation("/")}
      />
    );
  }

  // Spectator arriving via a shared "?spectator=1" link may have no stored
  // name yet. Prompt for a display name so the join effect can fire — without
  // this, the join guard (which requires playerName) silently leaves the viewer
  // on a perpetual "Connecting…" screen. UI-only; no socket/server change.
  if (wantsSpectate && !playerName) {
    const submit = () => {
      const n = spectatorNameInput.trim();
      if (n) savePlayerName(n);
    };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Watch this match</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Enter a name to spectate. You'll see scores, bids, and tricks live — never the players' hidden hands.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Input
            value={spectatorNameInput}
            onChange={(e) => setSpectatorNameInput(e.target.value.slice(0, 24))}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Your name"
            autoFocus
            data-testid="spectator-name-input"
          />
          <Button disabled={!spectatorNameInput.trim()} onClick={submit} data-testid="spectator-name-submit">
            Watch match
          </Button>
        </div>
      </div>
    );
  }

  if (!gameState || (!isSpectator && playerIndex === null)) {
    const label =
      status === "reconnecting" ? "Reconnecting to table…" :
      status === "offline"      ? "Connection lost. Trying to reconnect…" :
      "Connecting to table…";
    // Pre-June-1 bugfix #1: route Back to the active tournament if this is a
    // tournament match room (so a disconnected player lands on their bracket
    // page, not the public lobby). Falls back to "/" for non-tournament rooms.
    const tournamentCode =
      (gameState?.tournamentRef?.code) ||
      (typeof window !== "undefined" && roomCode
        ? window.localStorage.getItem(`spades_room_tournament_${roomCode}`) || null
        : null);
    const backHref = tournamentCode ? `/tournament/${tournamentCode}` : "/";
    const backLabel = tournamentCode ? "Back to tournament" : "Back to lobby";
    // If this browser is the unlocked admin, surface a shortcut to Host tools
    // right here — a disconnected admin should never lose access to
    // pause/forfeit/remake while stuck on the reconnecting screen.
    // SECURITY: gated on the admin-unlocked socket (isAdmin), never on any
    // localStorage artifact. Tournaments are admin-only; there is no host-token
    // path anymore. The server re-validates admin on every admin_* event.
    const isTournamentHost = !!tournamentCode && isAdmin;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-muted-foreground relative px-4 text-center">
        <div className="absolute top-2 right-2">
          {renderStatusPill()}
        </div>
        <div className="animate-pulse">{label}</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(backHref)}
            data-testid="button-bail-to-lobby"
          >
            {backLabel}
          </Button>
          {isTournamentHost && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLocation(`/tournament/${tournamentCode}/host`)}
              data-testid="button-host-tools"
            >
              Host tools
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Spectator: no "me" perspective. We use absolute seats: seat 1 (top) and seat 2 (bottom).
  // Player: bottom = self, top = opponent.
  const topIndex: 0 | 1 = spectator ? 0 : ((playerIndex === 0 ? 1 : 0) as 0 | 1);
  const bottomIndex: 0 | 1 = spectator ? 1 : (playerIndex as 0 | 1);

  // Build invite links from the current origin (works in dev preview & prod)
  const buildLink = (spectator: boolean) => {
    if (typeof window === "undefined" || !roomCode) return "";
    const url = new URL(window.location.origin + (window.location.pathname.replace(/\/room\/.*$/, "") || "/"));
    url.searchParams.set("room", roomCode);
    if (spectator) url.searchParams.set("mode", "spectator");
    return url.toString();
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast({ description: `${label} copied to clipboard` });
    } catch {
      toast({ description: `Couldn't copy ${label}. Long-press to copy manually.`, variant: "destructive" });
    }
  };

  const handleStartGame = () => startGame(roomCode!);
  const handleNextRound = () => nextRound(roomCode!);
  const activeForfeitPhase =
    gameState.phase === "bidding" ||
    gameState.phase === "playing" ||
    gameState.phase === "round_over";
  const canForfeit =
    !spectator &&
    playerIndex !== null &&
    activeForfeitPhase;

  const handleConfirmForfeit = async () => {
    if (!roomCode || playerIndex === null) return;
    try {
      await forfeitMatch(roomCode);
      clearPlayerToken(roomCode, playerIndex);
      clearStorage();
      clearReconnectRetry();
      toast({ description: "You forfeited this game. Your opponent was awarded the win." });
      setForfeitConfirmOpen(false);
      setLocation("/");
    } catch (err) {
      toast({
        description: typeof err === "string" ? err : "Could not forfeit this game.",
        variant: "destructive",
      });
    }
  };

  // KotT queue actions (spectators only).
  const isKingMode = gameState?.mode === "king";
  const queue = gameState?.challengerQueue ?? [];
  const mySocketId = socket?.id;
  const inQueue = !!mySocketId && queue.some((c) => c.id === mySocketId);
  const queuePosition = !!mySocketId
    ? queue.findIndex((c) => c.id === mySocketId)
    : -1;

  const handleJoinQueue = async () => {
    if (!roomCode || !playerName) return;
    try {
      await joinQueue(roomCode, playerName);
      toast({ description: "You're in line for the next match." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't join the queue.", variant: "destructive" });
    }
  };
  const handleLeaveQueue = async () => {
    if (!roomCode) return;
    try {
      await leaveQueue(roomCode);
      toast({ description: "You left the challenger line." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't leave the queue.", variant: "destructive" });
    }
  };

  // KotT losing player post-match actions (seated players only, at game_over).
  // rejoin=true → step down + queue for an immediate rematch vs the King.
  // rejoin=false → step down to a spectator and stay at the table to watch.
  const handleKottRejoinQueue = async () => {
    if (!roomCode) return;
    try {
      await kottStepDown(roomCode, true);
      toast({ description: "You're back in line — rematch starting…" });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't rejoin the queue.", variant: "destructive" });
    }
  };
  const handleKottBackToLobby = async () => {
    if (!roomCode) return;
    try {
      await kottStepDown(roomCode, false);
      toast({ description: "You stepped down — the King is waiting for a challenger." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't return to the lobby.", variant: "destructive" });
    }
  };

  // ── Dev/host Fast Finish test tool ──────────────────────────────────────
  const handleFastFinish = async (winnerSeat: 0 | 1) => {
    if (!roomCode) return;
    setFastFinishing(true);
    try {
      await fastFinishMatch(roomCode, winnerSeat);
      setFastFinishOpen(false);
      toast({ description: `Match ended — Seat ${winnerSeat + 1} wins.` });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Fast Finish failed.", variant: "destructive" });
    } finally {
      setFastFinishing(false);
    }
  };

  // ── King of the Table host controls (admin/streamer only) ───────────────
  const handleResetTable = async () => {
    if (!roomCode) return;
    try {
      await adminResetTable(roomCode);
      toast({ description: "Table reset." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't reset the table.", variant: "destructive" });
    }
  };
  const handleRemoveFromQueue = async (socketId: string) => {
    if (!roomCode) return;
    try {
      await adminRemoveFromQueue(roomCode, socketId);
      toast({ description: "Removed from queue." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't remove challenger.", variant: "destructive" });
    }
  };
  const handleSetNextChallenger = async (socketId: string) => {
    if (!roomCode) return;
    try {
      await adminSetNextChallenger(roomCode, socketId);
      toast({ description: "Moved to front of the queue." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Couldn't reorder the queue.", variant: "destructive" });
    }
  };

  // Reigning King DURING a live match = the seated player carrying an active
  // win streak (>0). Only one seat can have a streak at a time (the loser
  // resets to 0). Null until the first match is won.
  const streakKingSeat: 0 | 1 | null = isKingMode
    ? ((gameState?.kingStreak?.[0] ?? 0) > 0
        ? 0
        : (gameState?.kingStreak?.[1] ?? 0) > 0
          ? 1
          : null)
    : null;

  const seatedCount = isKingMode
    ? (gameState?.players?.filter((p) => p != null).length ?? 0)
    : 0;
  const loneSeat: 0 | 1 | null =
    isKingMode && seatedCount === 1 ? (gameState?.players?.[0] ? 0 : 1) : null;

  // At game_over the server has NOT yet bumped kingStreak — that only happens
  // during rotation (promoteNextChallenger), which requires a queued
  // challenger. So when a match ends (especially with no one in line) the
  // streak is stale: a fresh winner still reads as streak 0, and a dethroned
  // King still reads as streak>0. Derive the King from the match RESULT here:
  // explicit auto-victory winner, higher score wins, or the sole remaining
  // seat if the loser already stepped down. Keeps the crown correct for both
  // "King wins again" and "challenger
  // takes the crown", queue or no queue.
  const gameOverKingSeat: 0 | 1 | null = (() => {
    if (!isKingMode || gameState?.phase !== "game_over") return null;
    if (gameState.winnerSeat === 0 || gameState.winnerSeat === 1) return gameState.winnerSeat;
    const p0 = gameState?.players?.[0];
    const p1 = gameState?.players?.[1];
    if (p0 && !p1) return 0;
    if (!p0 && p1) return 1;
    if (!p0 && !p1) return null;
    const s0 = gameState?.scores?.[0] ?? 0;
    const s1 = gameState?.scores?.[1] ?? 0;
    if (s0 === s1) return null;
    return s0 > s1 ? 0 : 1;
  })();

  // Single source of truth for "who wears the crown right now", used by the
  // player rows, the queue panel, and every KotT status line.
  //  - At game_over the result is authoritative: gameOverKingSeat is the winner
  //    (or the lone remaining seat), or null on a tie — we do NOT fall back to
  //    the stale streak there, so a tie correctly shows no King.
  //  - Otherwise: the live-match streak King, else the lone seated player (a
  //    one-player KotT lobby reads as a held table, not an empty room).
  const tableHolderSeat: 0 | 1 | null =
    isKingMode && gameState?.phase === "game_over"
      ? gameOverKingSeat
      : (streakKingSeat ?? loneSeat);
  const kingSeat = tableHolderSeat;
  const kingName = tableHolderSeat !== null ? gameState?.players?.[tableHolderSeat]?.name ?? null : null;
  const tableHolderName = kingName;

  // Display win streak (×N). At game_over reconstruct the not-yet-committed
  // value (mirrors promoteNextChallenger: a continuing King is prev+1, a fresh
  // King is 1); otherwise use the live streak value from the server.
  const tableHolderStreak: number = (() => {
    if (tableHolderSeat === null) return 0;
    if (gameOverKingSeat !== null) {
      const prevKing =
        (gameState?.kingStreak?.[0] ?? 0) > 0
          ? 0
          : (gameState?.kingStreak?.[1] ?? 0) > 0
            ? 1
            : null;
      return gameOverKingSeat === prevKing
        ? (gameState?.kingStreak?.[gameOverKingSeat] ?? 0) + 1
        : 1;
    }
    return gameState?.kingStreak?.[tableHolderSeat] ?? 0;
  })();
  const kingStreakVal = tableHolderStreak;
  // Clear, stream-friendly KotT lobby/session state label (requirement: surface
  // Waiting for King / King waiting for challenger / Challenger joined /
  // Match in progress / Match complete states).
  const kottLobbyState: string = (() => {
    if (!isKingMode) return "";
    const phase = gameState?.phase;
    if (phase === "game_over") return "Match complete — winner is King";
    if (phase && phase !== "waiting") return "Match in progress";
    if (seatedCount === 0) return "Waiting for King";
    if (seatedCount === 1) return "King waiting for challenger";
    return "Challenger joined — ready up";
  })();

  const handleBid = async () => {
    if (!bidAmount || spectator) return;
    setIsSubmitting(true);
    try {
      await placeBid(roomCode!, parseInt(bidAmount));
    } catch (err: any) {
      toast({ description: err, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlayCard = async (card: CardType) => {
    if (spectator) return;
    if (gameState.phase !== "playing" || gameState.currentTurnIndex !== playerIndex) return;
    try {
      await playCard(roomCode!, card);
    } catch (err: any) {
      toast({ description: err, variant: "destructive" });
    }
  };

  const handleLeaveSpectate = () => {
    if (roomCode) {
      clearPersistedRoomSession(roomCode);
    }
    clearGameState();
    clearReconnectRetry();
    saveIsSpectator(false);
    setLocation("/");
  };

  const handleLeaveCompletedRoom = (target = "/") => {
    if (roomCode) {
      clearPersistedRoomSession(roomCode);
    }
    clearGameState();
    clearReconnectRetry();
    setLocation(target);
  };

  const handleLeaveWaitingRoom = async () => {
    if (!roomCode) {
      clearStorage();
      clearGameState();
      setLocation("/");
      return;
    }
    try {
      await leaveRoom(roomCode);
    } catch (err: any) {
      toast({
        description: typeof err === "string" ? err : "Leaving room locally.",
      });
    } finally {
      if (playerIndex !== null) {
        clearPlayerToken(roomCode, playerIndex);
      }
      clearStorage();
      clearGameState();
      clearReconnectRetry();
      setLocation("/");
    }
  };

  const handleToggleReady = async () => {
    if (!roomCode || playerIndex === null) return;
    const current = gameState?.ready?.[playerIndex] ?? false;
    try {
      await doSetReady(roomCode, !current);
    } catch (err: any) {
      toast({
        description: typeof err === "string" ? err : "Couldn't update ready status.",
        variant: "destructive",
      });
    }
  };

  const handleResetRoom = async () => {
    if (!isAdmin || !roomCode) return;
    const ok = typeof window !== "undefined"
      ? window.confirm("Reset this room? Scores and current hand will be cleared. Both players stay in the room.")
      : true;
    if (!ok) return;
    setIsResetting(true);
    try {
      await doResetRoom(roomCode);
      toast({ description: "Room reset. Click Start when ready." });
    } catch (err: any) {
      toast({
        description: typeof err === "string" ? err : "Couldn't reset the room.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Soft AFK display for the current active turn. Server owns auto-forfeit.
  const afkLevelFor = (idx: 0 | 1): null | "may" | "afk" => {
    const ts = gameState.lastActiveAt?.[idx];
    if (!ts) return null;
    const isTheirTurnish =
      (gameState.phase === "bidding" && gameState.currentBidder === idx) ||
      (gameState.phase === "playing"  && gameState.currentTurnIndex === idx);
    if (!isTheirTurnish) return null;
    const elapsed = now - ts;
    if (elapsed >= 90_000) return "afk";
    if (elapsed >= 60_000) return "may";
    return null;
  };

  // Connection status pill — always rendered top-right of the room.
  // Function declaration so it can be referenced from the early-return above
  // (function declarations are hoisted within their enclosing function scope).
  function renderStatusPill() {
    const map: Record<typeof status, { label: string; cls: string; dot: string }> = {
      online: {
        label: "Online",
        cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
        dot: "bg-emerald-400",
      },
      connecting: {
        label: "Connecting…",
        cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
        dot: "bg-yellow-400 animate-pulse",
      },
      reconnecting: {
        label: "Reconnecting…",
        cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
        dot: "bg-yellow-400 animate-pulse",
      },
      offline: {
        label: "Offline",
        cls: "border-red-500/40 bg-red-500/10 text-red-300",
        dot: "bg-red-400",
      },
    };
    const v = map[status];
    return (
      <div
        data-testid="connection-status"
        className={cn(
          "absolute z-40 flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.08em] leading-none backdrop-blur-sm pointer-events-none shadow-none",
          v.cls
        )}
        style={{
          top: "max(6px, env(safe-area-inset-top))",
          right: "calc(env(safe-area-inset-right) + 10px)",
        }}
      >
        <span className={cn("inline-block w-[7px] h-[7px] rounded-full", v.dot)} />
        {v.label}
      </div>
    );
  };

  // ── Status banner ──────────────────────────────────────────────────────────
  // Compact match-label bar used by both the status banner and the
  // coin-toss/bidding hint blocks so the label stays visible.
  const renderMatchLabelBar = () => (
    <div
      data-testid="match-label"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center py-1 px-3 text-[11px] tracking-widest uppercase bg-primary/15 text-primary font-semibold border-b border-primary/20"
    >
      <span>{gameState.matchLabel}</span>
      <span className="text-muted-foreground/80 normal-case tracking-normal font-normal">
        Room <span className="font-mono font-semibold text-primary tracking-[0.14em] break-all">{roomCode}</span>
      </span>
    </div>
  );

  const renderRoomCodeStrip = () => (
    <div
      data-testid="active-room-code"
      className="border-b border-primary/20 bg-black/35 px-3 py-2 text-center text-[11px] uppercase tracking-widest text-muted-foreground"
    >
      <span className="mr-2">Room Code</span>
      <span className="font-mono text-sm font-bold tracking-[0.14em] text-primary select-all break-all">
        {roomCode}
      </span>
    </div>
  );

  const renderStatusBanner = () => {
    const { phase, currentBidder, currentTurnIndex } = gameState;
    let message = "";
    let colorClass = "bg-white/5 text-muted-foreground";

    if (phase === "coin_toss") {
      message = "Flipping coin…";
      colorClass = "bg-primary/20 text-primary font-semibold";
    } else if (phase === "bidding") {
      // Stable derivation: odd round → firstBidderRound1; even → opposite seat.
      // Do NOT use currentBidder — it flips after the first bid is placed.
      const fbR1 = gameState.firstBidderRound1;
      const roundFirstBidder: 0 | 1 | null =
        fbR1 === null
          ? null
          : gameState.roundNumber % 2 === 1
            ? fbR1
            : (fbR1 === 0 ? 1 : 0);
      const firstBidderSeat = roundFirstBidder !== null ? roundFirstBidder + 1 : null;
      if (!spectator && currentBidder === playerIndex) {
        message = "Your turn to bid";
        colorClass = "bg-primary/20 text-primary font-semibold";
      } else if (currentBidder !== null) {
        // Distinguish "opponent hasn't bid yet" from "waiting after you bid"
        const myBid = !spectator ? gameState.bids[playerIndex as 0 | 1] : null;
        if (!spectator && myBid === null && currentBidder !== playerIndex) {
          message = "Opponent has not bid";
        } else {
          message = "Waiting for opponent to bid";
        }
      }
      // Always show "Round N · Seat X bids first this round" during bidding
      if (firstBidderSeat !== null) {
        return (
          <div>
            {gameState.matchLabel && renderMatchLabelBar()}
            <div
              data-testid="first-bidder-hint"
              className="text-center py-1 px-4 text-[11px] tracking-wider uppercase bg-white/5 text-muted-foreground"
            >
              <span className="text-foreground font-semibold">Round {gameState.roundNumber}</span>
              <span className="mx-2 opacity-50">·</span>
              <span className="text-primary font-semibold">Seat {firstBidderSeat}</span> bids first this round
            </div>
            <div className={`text-center py-2 px-4 text-sm tracking-wide transition-colors ${colorClass}`}>
              {message}
            </div>
          </div>
        );
      }
    } else if (phase === "playing") {
      if (currentTurnIndex === null) {
        message = "Trick resolving…";
        colorClass = "bg-white/5 text-muted-foreground italic";
      } else if (!spectator && currentTurnIndex === playerIndex) {
        message = "Your turn to play";
        colorClass = "bg-primary/20 text-primary font-semibold";
      } else {
        message = "Waiting for opponent to play";
      }
    } else if (phase === "round_over") {
      message = "Round complete";
      colorClass = "bg-yellow-500/10 text-yellow-400 font-semibold";
    } else if (phase === "game_over") {
      message = "Game over";
    }

    const showTiebreaker =
      gameState.tiebreakerActive &&
      gameState.tiebreakerRound >= 1 &&
      gameState.tiebreakerRound <= 3 &&
      (phase === "bidding" || phase === "playing" || phase === "round_over");

    const turnDeadline = gameState.turnDeadline ?? null;
    const turnBudget = gameState.turnTimeoutMs ?? null;
    const actorIdx: 0 | 1 | null =
      phase === "bidding" ? currentBidder :
      phase === "playing" ? currentTurnIndex :
      null;
    const showTurnTimer = !!turnDeadline && !!turnBudget && actorIdx !== null;
    const timerLabel = !spectator && actorIdx === playerIndex
      ? "Your turn — move before AFK forfeit"
      : `${actorIdx !== null ? gameState.players[actorIdx]?.name ?? `Seat ${actorIdx + 1}` : "Opponent"} thinking…`;

    return (
      <div>
        {gameState.matchLabel && renderMatchLabelBar()}
        {showTiebreaker && (
          <div className="text-center py-1 px-4 text-xs tracking-wider uppercase bg-orange-500/15 text-orange-300 font-semibold">
            Tiebreaker · Round {gameState.tiebreakerRound} of 3
          </div>
        )}
        {showTurnTimer && turnDeadline && turnBudget && (
          <TurnTimerBar deadline={turnDeadline} total={turnBudget} label={timerLabel} />
        )}
        <div className={`text-center py-2 px-4 text-sm tracking-wide transition-colors ${colorClass}`}>
          {message}
        </div>
      </div>
    );
  };

  // ── Player info row (renders any seat by index) ────────────────────────────
  const renderPlayerInfo = (idx: 0 | 1, opts?: { isTopSeat?: boolean }) => {
    const isMe = !spectator && idx === playerIndex;
    const p    = gameState.players[idx];
    const name = p?.name;
    const score = gameState.scores[idx];
    const bags  = gameState.bags[idx];
    const bid   = gameState.bids[idx];
    const tricks = gameState.tricks[idx];
    const seatLabel = `Seat ${idx + 1}`;
    // Crown follows the unified table-holder derivation so it stays correct at
    // game_over (winner crowned immediately, dethroned King uncrowned) — not
    // just the raw, possibly-stale, server streak.
    const showCrown = isKingMode && tableHolderSeat === idx;
    const streak = showCrown ? tableHolderStreak : 0;
    const isTurn  = gameState.phase === "playing" && gameState.currentTurnIndex === idx;
    const isBidding = gameState.phase === "bidding" && gameState.currentBidder === idx;
    const isActive = isTurn || isBidding;
    const afk = afkLevelFor(idx);

    return (
      <div
        data-testid={`player-info-seat-${idx + 1}`}
        className={cn(
          // relative + z-[110] keeps the score row above the bidding modal
          // backdrop (z-[100]) so the bottom-player score stays visible while
          // bidding. The modal itself stays centered between the two rows.
          "spades-seat-bar relative z-[110] flex w-full max-w-full min-w-0 shrink-0 flex-col items-stretch gap-1 px-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 py-1.5 sm:py-3 border-y backdrop-blur-sm transition-shadow overflow-visible",
          isActive
            ? "border-primary/60 shadow-[inset_0_0_0_1px_hsla(35,90%,55%,0.5),0_0_12px_-2px_hsla(35,90%,55%,0.35)]"
            : "border-border",
          opts?.isTopSeat && "pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:pt-[calc(env(safe-area-inset-top)+1.75rem)]",
        )}
      >
        <div className="flex flex-1 items-center gap-1.5 sm:gap-3 min-w-0">
          <div className="flex min-w-0 shrink flex-col leading-tight">
            <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">
              {seatLabel}{isMe ? " · You" : ""}
            </span>
            <span className="text-[1.05rem] font-bold font-serif truncate max-w-[6.25rem] sm:max-w-[10rem] sm:text-base">
              {showCrown && (
                <span
                  data-testid={`king-crown-seat-${idx + 1}`}
                  title={`King streak: ${streak}`}
                  className="mr-1 text-yellow-400"
                >
                  👑{streak > 1 && <span className="text-[10px] font-mono align-top ml-0.5">×{streak}</span>}
                </span>
              )}
              {name ?? "Waiting…"}
              {isActive && <span className="text-primary ml-2 animate-pulse">●</span>}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 gap-1 sm:gap-2 overflow-hidden">
            <Badge variant="outline" className="shrink-0 px-1.5 text-[10px] sm:text-xs tabular-nums">{score} pts</Badge>
            <Badge variant="outline" className={`shrink-0 px-1.5 text-[10px] sm:text-xs tabular-nums ${bags >= 8 ? "border-yellow-500 text-yellow-400" : "text-muted-foreground"}`}>
              {bags} bag{bags !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="shrink-0 px-1.5 text-[10px] sm:text-xs tabular-nums text-muted-foreground">
              {gameState.handSizes?.[idx] ?? 0} cards
            </Badge>
            {afk === "may" && !isMe && (
              <Badge
                data-testid={`afk-badge-seat-${idx + 1}`}
                variant="outline"
                className="hidden sm:inline-flex text-xs border-yellow-500/60 text-yellow-300"
              >
                ⏳ May be AFK
              </Badge>
            )}
            {afk === "afk" && !isMe && (
              <Badge
                data-testid={`afk-badge-seat-${idx + 1}`}
                variant="outline"
                className="hidden sm:inline-flex text-xs border-red-500/60 text-red-300"
              >
                ⚠ AFK
              </Badge>
            )}
          </div>
        </div>

        {gameState.phase !== "waiting" && (
          <div className="flex shrink-0 justify-end gap-2 text-right leading-none sm:gap-5">
            <div className="flex min-w-[2.65rem] sm:min-w-[3rem] flex-col items-center">
              <span className="text-muted-foreground text-[9px] sm:text-[10px] uppercase tracking-wider leading-none">Bid</span>
              <span className="text-base sm:text-xl font-bold font-mono leading-none mt-0.5">{bid !== null ? bid : "—"}</span>
            </div>
            <div className="flex min-w-[2.65rem] sm:min-w-[3rem] flex-col items-center">
              <span className="text-muted-foreground text-[9px] sm:text-[10px] uppercase tracking-wider leading-none">Tricks</span>
              <span className={`text-base sm:text-xl font-bold font-mono leading-none mt-0.5 ${bid !== null && tricks > bid ? "text-yellow-400" : tricks === bid && bid !== null ? "text-green-400" : ""}`}>
                {tricks}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Shared lobby pieces (used by both player + spectator waiting screens) ──
  const matchSettingsItems: { label: string; value: string }[] = [
    { label: "Race to", value: String(gameState?.matchTarget ?? 250) },
    { label: "Nil bids", value: "Allowed (±100)" },
    { label: "Hidden hands", value: "Enforced" },
    { label: "Anti-cheat", value: "Server-authoritative" },
  ];

  const renderMatchSettingsCard = () => (
    <div
      data-testid="lobby-match-settings"
      className="rounded-xl border border-primary/30 bg-black/40 p-4 space-y-3 shadow-inner"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-primary/90">
          Match Settings
        </h3>
        {gameState.matchLabel && (
          <span
            data-testid="match-label"
            className="px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-widest truncate max-w-[60%]"
          >
            {gameState.matchLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {matchSettingsItems.map((it) => (
          <div key={it.label} className="text-[11px] leading-tight">
            <div className="text-muted-foreground uppercase tracking-wider">{it.label}</div>
            <div className="text-foreground font-semibold">{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPlayerPanel = (seatIdx: 0 | 1, opts?: { selfIndex?: 0 | 1 | null }) => {
    const p = gameState.players[seatIdx];
    const ready = !!gameState.ready?.[seatIdx];
    const isSelf = opts?.selfIndex === seatIdx;
    const seatLabel = `Player ${seatIdx + 1}`;
    return (
      <div
        data-testid={`lobby-player-panel-${seatIdx}`}
        className={cn(
          "rounded-xl border p-4 flex flex-col gap-2 min-h-[140px] transition-colors",
          p
            ? ready
              ? "border-emerald-500/60 bg-emerald-500/[0.06]"
              : "border-primary/40 bg-white/[0.03]"
            : "border-dashed border-border bg-white/[0.02]",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {seatLabel}{isSelf ? " · You" : ""}{seatIdx === 0 ? " · Host" : ""}
          </span>
          {p && (
            <span
              data-testid={`lobby-ready-status-${seatIdx}`}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                ready
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                  : "border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
              )}
            >
              {ready ? "✓ Ready" : "Not ready"}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-center">
          {p ? (
            <div className="font-serif text-xl font-bold text-primary truncate">
              {p.name}
            </div>
          ) : (
            <div className="text-muted-foreground italic text-sm animate-pulse">
              Waiting for player…
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Waiting screen (players only — spectators bypass this) ─────────────────
  const renderWaiting = () => {
    const me = playerIndex !== null ? gameState.players[playerIndex] : null;
    const opponentIdx: 0 | 1 = playerIndex === 0 ? 1 : 0;
    const opponent = gameState.players[opponentIdx];
    const myReady    = !!gameState.ready?.[playerIndex as 0 | 1];
    const oppReady   = !!gameState.ready?.[opponentIdx];
    const bothPresent = !!me && !!opponent;
    const bothReady   = bothPresent && myReady && oppReady;
    const canStart    = isHost && bothReady;

    const statusMsg = isKingMode
      ? (!opponent
          ? "👑 You're the King — waiting for a challenger to join."
          : !bothReady
            ? "Challenger joined — both players ready up to begin."
            : "Ready to start.")
      : (!opponent
          ? "Waiting for opponent…"
          : !bothReady
            ? "Waiting for both players to ready up…"
            : "Ready to start.");
    const statusTone = !opponent
      ? "text-muted-foreground"
      : !bothReady
        ? "text-yellow-300"
        : "text-emerald-300";
    const presenceTitle = !opponent
      ? (isKingMode ? "Waiting for challenger" : "Invite your opponent")
      : bothReady
        ? "Both players ready"
        : (isKingMode ? "Challenger joined" : "Opponent joined");
    const presenceCopy = !opponent
      ? "Share the room code or invite link. The lobby updates as soon as another player joins."
      : bothReady
        ? "Start the match when you are ready."
        : oppReady && !myReady
          ? "Opponent is ready. Press Ready Up to continue."
          : myReady && !oppReady
            ? "You are ready. Waiting for opponent to press Ready."
            : "Both players are here. Each player needs to press Ready.";
    const readyBadge = (ready: boolean, label: string) => (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
          ready
            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
            : "border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
        )}
      >
        {label}: {ready ? "Ready" : "Waiting"}
      </span>
    );

    return (
      <div className="flex-1 overflow-y-auto px-4 py-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="spades-room-content">
          <div className="spades-panel rounded-2xl border-2 border-primary/40 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-6 pb-4 text-center border-b border-primary/20">
              <div className="flex items-center justify-center gap-2 text-base mb-2" aria-hidden>
                <span className="text-primary">♠</span>
                <span className="text-red-500">♥</span>
                <span className="text-blue-500">♦</span>
                <span className="text-emerald-500">♣</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-primary tracking-wider drop-shadow-[0_2px_8px_rgba(234,179,8,0.25)]">
                {isKingMode ? "Table Streak" : "Spades Free Play"}
              </h1>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">
                {isKingMode ? (kottLobbyState || "Pre-match lobby") : "Pre-match lobby"}
              </p>
            </div>

            {/* Lobby presence */}
            <div
              data-testid="lobby-presence-card"
              className={cn(
                "mx-4 mt-4 rounded-xl border-2 p-4 shadow-[inset_0_0_24px_rgba(234,179,8,0.12)]",
                opponent
                  ? "border-emerald-400/55 bg-emerald-950/30"
                  : "border-primary/40 bg-primary/10",
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Free Play Lobby
              </p>
              <h2 className="mt-1 font-serif text-3xl leading-tight text-foreground">
                {presenceTitle}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-snug text-foreground/85">
                {presenceCopy}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {readyBadge(myReady, "You")}
                {opponent ? (
                  readyBadge(oppReady, "Opponent")
                ) : (
                  <span className="inline-flex items-center justify-center rounded-full border border-muted-foreground/30 bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Opponent: Not joined
                  </span>
                )}
              </div>
              {bothReady && readyStartCountdown !== null && (
                <div
                  data-testid="ready-start-countdown"
                  className="mt-4 rounded-lg border border-emerald-400/50 bg-black/35 px-4 py-3 text-center shadow-[inset_0_0_20px_rgba(16,185,129,0.12)]"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300">
                    Both players ready
                  </div>
                  <div className="mt-1 font-serif text-3xl font-bold text-primary">
                    Starting in {readyStartCountdown}
                  </div>
                </div>
              )}
            </div>

            {/* Room code + invite */}
            <div className="px-5 pt-5 pb-4 space-y-3 border-b border-primary/20">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">
                Room Code
              </p>
              <div
                data-testid="lobby-room-code"
                className="text-4xl sm:text-5xl font-mono tracking-[0.14em] sm:tracking-[0.3em] font-bold text-center text-primary bg-black/50 py-4 px-3 rounded-lg border-2 border-primary/50 shadow-[inset_0_0_20px_rgba(234,179,8,0.15)] select-all break-all"
              >
                {roomCode}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(buildLink(false), isKingMode ? "Challenger link" : "Invite link")}
                  data-testid="button-copy-invite-link"
                  className="min-h-[44px] border-primary/40 hover:bg-primary/10"
                >
                  {isKingMode ? "🔗 Copy Challenger Link" : "🔗 Copy Invite Link"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(buildLink(true), isKingMode ? "Watch Table link" : "Spectator link")}
                  data-testid="button-copy-spectator-link"
                  className="min-h-[44px]"
                >
                  👀 {isKingMode ? "Copy Watch Table Link" : "Copy Spectator Link"}
                </Button>
              </div>
            </div>

            {/* Player panels */}
            <div className="px-5 py-5 space-y-3 border-b border-primary/20">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Players
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderPlayerPanel(0, { selfIndex: playerIndex })}
                {renderPlayerPanel(1, { selfIndex: playerIndex })}
              </div>
            </div>

            {/* Match settings */}
            <div className="px-5 py-5 border-b border-primary/20">
              {renderMatchSettingsCard()}
            </div>

            {/* Status + actions */}
            <div className="px-5 pt-4 pb-6 space-y-3">
              <div
                data-testid="lobby-status-message"
                className={cn(
                  "text-center text-sm font-semibold tracking-wide",
                  statusTone,
                )}
              >
                {statusMsg}
              </div>

              <PreGameChecklist />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  onClick={handleToggleReady}
                  data-testid="button-ready-up"
                  className={cn(
                    "min-h-[48px] text-base font-bold tracking-wide active:scale-[0.98] transition-transform",
                    myReady
                      ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                      : "bg-primary hover:bg-primary/90",
                  )}
                >
                  {myReady ? "✓ Ready (Tap to Cancel)" : "Ready Up"}
                </Button>
                {(() => {
                  // Pre-June-1 bugfix #6: in tournament match rooms, BOTH
                  // players see the Start button (server now accepts start_game
                  // from either seat in a tournament room). Non-tournament
                  // rooms keep the room-host-only gating.
                  const isTournamentMatch = !!gameState.tournamentRef;
                  const canIStart = isTournamentMatch ? bothReady : canStart;
                  const showStart = isTournamentMatch || isHost;
                  return showStart ? (
                    <Button
                      onClick={handleStartGame}
                      disabled={!canIStart}
                      data-testid="button-start-match"
                      variant="default"
                      className="min-h-[48px] text-base font-bold tracking-wide bg-amber-500 hover:bg-amber-500/90 text-black disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
                    >
                      Start Match
                    </Button>
                  ) : (
                    <div
                      className="min-h-[48px] flex items-center justify-center text-xs text-muted-foreground italic border border-dashed border-border rounded-md"
                      data-testid="lobby-host-only-hint"
                    >
                      Host controls the start
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {isAdmin && (
                  <Button
                    variant="outline"
                    onClick={handleResetRoom}
                    disabled={isResetting}
                    data-testid="button-reset-room"
                    className="min-h-[44px]"
                  >
                    {isResetting ? "Resetting…" : "↺ Reset Room"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={handleLeaveWaitingRoom}
                  data-testid="button-leave-room"
                  className={cn(
                    "min-h-[44px] text-muted-foreground hover:text-foreground",
                    !isAdmin && "sm:col-span-2",
                  )}
                >
                  Leave Room
                </Button>
              </div>

              {isHost && !bothReady && opponent && (
                <p className="text-[10px] text-muted-foreground text-center px-2">
                  Start Match unlocks once both players are ready.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Spectator waiting screen ──────────────────────────────────────────────
  const renderSpectatorWaiting = () => (
    <div className="flex-1 overflow-y-auto px-4 py-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <div className="spades-room-content">
        <div className="spades-panel rounded-2xl border-2 border-primary/40 backdrop-blur-sm overflow-hidden">
          <div className="px-5 pt-6 pb-4 text-center border-b border-primary/20">
            <Badge variant="outline" className="border-primary/40 text-primary uppercase tracking-widest text-[10px] mb-2">
              Spectator
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-primary tracking-wider">
              Spades Free Play
            </h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">
              Watching room
            </p>
          </div>

          <div className="px-5 pt-5 pb-4 space-y-3 border-b border-primary/20">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">
              Room Code
            </p>
            <div className="text-4xl sm:text-5xl font-mono tracking-[0.14em] sm:tracking-[0.3em] font-bold text-center text-primary bg-black/50 py-4 px-3 rounded-lg border-2 border-primary/50 shadow-[inset_0_0_20px_rgba(234,179,8,0.15)] select-all break-all">
              {roomCode}
            </div>
            <Button
              variant="outline"
              onClick={() => copyToClipboard(buildLink(true), isKingMode ? "Watch Table link" : "Spectator link")}
              data-testid="button-copy-spectator-link"
              className="w-full min-h-[44px]"
            >
              👀 {isKingMode ? "Copy Watch Table Link" : "Copy Spectator Link"}
            </Button>
          </div>

          <div className="px-5 py-5 space-y-3 border-b border-primary/20">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Players</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderPlayerPanel(0)}
              {renderPlayerPanel(1)}
            </div>
          </div>

          <div className="px-5 py-5 border-b border-primary/20">
            {renderMatchSettingsCard()}
          </div>

          <div className="px-5 pt-4 pb-6 space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              {isKingMode
                ? "Watching the table — the King defends their seat, challengers rotate in. Hands stay hidden; you'll see bids, tricks, and scores live."
                : "Waiting for the players to start. Hands stay hidden — you'll see bids, tricks, and scores live."}
            </p>
            <Button
              variant="ghost"
              onClick={handleLeaveSpectate}
              data-testid="button-leave-spectate"
              className="w-full min-h-[44px] text-muted-foreground hover:text-foreground"
            >
              Leave Room
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Table (trick area + overlays) ─────────────────────────────────────────
  const renderTable = () => {
    const topCard    = gameState.currentTrick.find(t => t.playerIndex === topIndex)?.card;
    const bottomCard = gameState.currentTrick.find(t => t.playerIndex === bottomIndex)?.card;
    const topPlayer    = gameState.players[topIndex];
    const bottomPlayer = gameState.players[bottomIndex];
    const topHandSize    = gameState.handSizes?.[topIndex] ?? 0;
    const bottomHandSize = gameState.handSizes?.[bottomIndex] ?? 0;

    const lastRound = gameState.roundHistory[gameState.roundHistory.length - 1];
    const prevRound = gameState.roundHistory[gameState.roundHistory.length - 2];
    const prevBags: [number, number] = prevRound ? prevRound.bags : [0, 0];

    const topLabel    = topPlayer?.name?.split(" ")[0] ?? `Seat ${topIndex + 1}`;
    const bottomLabel = spectator
      ? (bottomPlayer?.name?.split(" ")[0] ?? `Seat ${bottomIndex + 1}`)
      : "You";

    return (
      <div className="spades-game-board spades-table-surface flex min-h-[17rem] min-w-0 flex-1 flex-col items-center justify-center relative overflow-hidden px-1.5 py-1 sm:min-h-0 sm:px-2 sm:py-0">
        {/* Top seat hidden hand (always hidden — even players don't see opponent's cards) */}
        <div className="absolute top-3 sm:top-4 flex justify-center w-full pointer-events-none">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-10">
              {Array.from({ length: topHandSize }).map((_, i) => (
                <CardComponent key={`top-${i}`} hidden className="scale-75" />
              ))}
            </div>
            {topHandSize > 0 && (
              <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                {topHandSize} card{topHandSize !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Spectator: bottom seat shown as hidden hand too */}
        {spectator && (
          <div className="absolute bottom-4 flex justify-center w-full pointer-events-none">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-10">
                {Array.from({ length: bottomHandSize }).map((_, i) => (
                  <CardComponent key={`bot-${i}`} hidden className="scale-75" />
                ))}
              </div>
              {bottomHandSize > 0 && (
                <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                  {bottomHandSize} card{bottomHandSize !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Center trick area */}
        <div className="spades-table-pocket rounded-full flex items-center justify-center relative">
          {gameState.spadesBroken && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground uppercase tracking-widest opacity-60 whitespace-nowrap">
              ♠ Spades Broken
            </div>
          )}
          <div className="flex flex-col items-center justify-center gap-2 relative z-10">
            <div className="flex gap-5 sm:gap-10">
              <div className="w-[5rem] h-[7.1rem] sm:w-24 sm:h-36 border-2 border-dashed border-primary/24 rounded-xl flex items-center justify-center relative bg-black/14">
                {topCard ? (
                  <div className="absolute inset-0 z-10 -translate-y-2">
                    <CardComponent card={topCard} />
                  </div>
                ) : null}
                <span className="text-white/20 text-xs font-serif">{topLabel}</span>
              </div>
              <div className="w-[5rem] h-[7.1rem] sm:w-24 sm:h-36 border-2 border-dashed border-primary/24 rounded-xl flex items-center justify-center relative bg-black/14">
                {bottomCard ? (
                  <div className="absolute inset-0 z-20 translate-y-2">
                    <CardComponent card={bottomCard} />
                  </div>
                ) : null}
                <span className="text-white/20 text-xs font-serif">{bottomLabel}</span>
              </div>
            </div>
            {renderLastTrickMini()}
          </div>
        </div>

        {/* Shuffle / deal animation — shown to all roles within the server's ~3.1s shuffling window before each round */}
        {gameState.phase === "shuffling" && !dealSkipped && (
          <ShuffleOverlay onSkip={() => setDealSkipped(true)} />
        )}

        {/* Coin toss overlay — shown to all roles for ~3.5s, server transitions to bidding */}
        {gameState.phase === "coin_toss" && gameState.coinFlipWinner !== null && (() => {
          const winnerName = gameState.players[gameState.coinFlipWinner]?.name ?? `Seat ${gameState.coinFlipWinner + 1}`;
          const loserIdx: 0 | 1 = gameState.coinFlipWinner === 0 ? 1 : 0;
          const loserName = gameState.players[loserIdx]?.name ?? `Seat ${loserIdx + 1}`;
          const youWon = !spectator && playerIndex === gameState.coinFlipWinner;
          const resultSide = gameState.coinFlipWinner === 0 ? "heads" : "tails";
          const resultLabel = resultSide === "heads" ? "Heads" : "Tails";
          return (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-lg"
              data-testid="coin-toss-overlay"
            >
              <div className="bg-card border border-border p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center space-y-5">
                <div className="spades-coin-stage" aria-hidden="true">
                  <div
                    className={`spades-live-coin spades-live-coin--${resultSide}`}
                    data-testid="live-coin-toss"
                  >
                    <div className="spades-live-coin__face spades-live-coin__face--heads">
                      <div className="spades-live-coin__rim">1v1 SPADES</div>
                      <div className="spades-live-coin__spade">♠</div>
                      <div className="spades-live-coin__mark">1v1</div>
                      <div className="spades-live-coin__side">HEADS</div>
                    </div>
                    <div className="spades-live-coin__face spades-live-coin__face--tails">
                      <div className="spades-live-coin__rim">1v1 SPADES</div>
                      <div className="spades-live-coin__dragon">♞</div>
                      <div className="spades-live-coin__spade spades-live-coin__spade--tails">♠</div>
                      <div className="spades-live-coin__side">TAILS</div>
                    </div>
                  </div>
                </div>
                <h3 className="text-2xl font-serif text-primary">Coin Toss</h3>
                <p className="text-sm text-muted-foreground">
                  Live server toss. <span className="font-semibold text-foreground">Heads = Seat 1</span>,{" "}
                  <span className="font-semibold text-foreground">Tails = Seat 2</span>.
                </p>
                <div className="space-y-1 border-y border-border py-3">
                  {coinTossRevealed ? (
                    <>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest">
                        Result: <span className="text-primary">{resultLabel}</span>
                      </p>
                      <p data-testid="coin-toss-winner" className="text-2xl font-serif font-bold text-primary">
                        {spectator
                          ? `${winnerName} won the flip`
                          : youWon
                            ? "You won the flip"
                            : "Opponent won the flip"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest">
                        Result
                      </p>
                      <p data-testid="coin-toss-winner" className="text-2xl font-serif font-bold text-primary">
                        Flipping…
                      </p>
                    </>
                  )}
                </div>
                {coinTossRevealed ? (
                  <p className="text-sm">
                    <span className="font-semibold text-foreground" data-testid="coin-toss-first-bidder">{loserName}</span>{" "}
                    bids first in Round 1. Bidding order alternates each round after.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="coin-toss-first-bidder">
                    Flipping…
                  </p>
                )}
                <p className="text-xs text-muted-foreground italic">
                  {coinTossRevealed ? "Dealing cards…" : "Coin in motion…"}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Bidding overlay (players only).
            Keep controls away from the bottom hand tray so all 13 cards remain
            visible and horizontally scrollable while a bid is being chosen. */}
        {!spectator && gameState.phase === "bidding" && gameState.currentBidder === playerIndex && (
          <>
            <div
              className="fixed inset-0 z-[90] bg-black/75 pointer-events-none"
              data-testid="bidding-backdrop"
              aria-hidden="true"
            />
            <div
              className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto pointer-events-none sm:items-center"
              style={{
                paddingTop: "max(0.5rem, env(safe-area-inset-top))",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 8.25rem)",
                paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
                paddingRight: "max(0.5rem, env(safe-area-inset-right))",
              }}
              data-testid="bidding-overlay"
            >
              <div className="bg-card/96 border border-border p-3 sm:p-5 rounded-xl shadow-2xl space-y-3 w-full max-w-[min(34rem,calc(100vw-1rem))] text-center max-h-[min(72dvh,34rem)] sm:max-h-[80dvh] overflow-y-auto pointer-events-auto backdrop-blur-md">
                <h3 className="text-sm sm:text-lg font-serif text-primary">Place your bid</h3>
                {gameState.bids[0] === null && gameState.bids[1] === null && (
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-primary/80">
                    You bid first this round (Round {gameState.roundNumber})
                  </p>
                )}
                {(gameState.bids[0] !== null || gameState.bids[1] !== null) && (
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-muted-foreground">
                    You bid second this round
                  </p>
                )}
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  You have {gameState.hand.length} cards. Bid 0 for Nil (+/−100).
                </p>
                {(() => {
                  const mySeat = playerIndex as 0 | 1;
                  const oppSeat = mySeat === 0 ? 1 : 0;
                  const oppBid = gameState.bids[oppSeat];
                  const oppName = gameState.players[oppSeat]?.name ?? `Seat ${oppSeat + 1}`;
                  return (
                    <div
                      data-testid="bidding-opponent-bid"
                      className="rounded-lg border border-primary/35 bg-black/50 px-3 py-2 text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {oppName} bid this round
                        </span>
                        <span className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-sm font-black text-primary whitespace-nowrap">
                          {oppBid === null ? "No bid yet" : oppBid === 0 ? "Nil" : oppBid}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <div
                  data-testid="bid-buttons"
                  className="grid grid-cols-7 gap-1.5 w-full sm:gap-2"
                >
                  {Array.from({ length: 14 }).map((_, i) => {
                    const val = i.toString();
                    const selected = bidAmount === val;
                    return (
                      <button
                        key={i}
                        type="button"
                        data-testid={`bid-btn-${i}`}
                        onClick={() => setBidAmount(val)}
                        className={cn(
                          "min-h-[36px] sm:min-h-[44px] rounded-lg border text-xs sm:text-sm font-bold tabular-nums transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-white/[0.04] text-foreground border-white/20 hover:bg-white/[0.08] active:bg-white/10"
                        )}
                      >
                        {i === 0 ? "Nil" : i}
                      </button>
                    );
                  })}
                </div>
                <div className="-mx-3 -mb-3 px-3 pt-2 pb-3 sm:-mx-5 sm:-mb-5 sm:px-5 sm:pb-5 bg-card/96">
                  <Button
                    onClick={handleBid}
                    disabled={!bidAmount || isSubmitting}
                    className="mx-auto flex h-auto min-h-[44px] w-full max-w-[240px] items-center justify-center px-5 py-2 text-sm sm:text-base"
                    data-testid="button-confirm-bid"
                  >
                    {bidAmount ? `Bid ${bidAmount === "0" ? "Nil" : bidAmount}` : "Select a bid first"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Round over overlay (shown to everyone, including spectators) */}
        {gameState.phase === "round_over" && lastRound && (
          <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-4">
            <div className="bg-card border border-border p-4 sm:p-7 lg:p-8 rounded-xl shadow-2xl w-full max-w-[min(46rem,calc(100vw-1rem))] mx-auto space-y-4 sm:space-y-6">
              <h3 className="text-xl sm:text-3xl font-serif text-center text-primary border-b border-border pb-3 sm:pb-4">
                Round {lastRound.round} Summary
              </h3>

              <div className="grid grid-cols-2 gap-2 sm:gap-5 text-center">
                {([0, 1] as (0 | 1)[]).map((idx) => {
                  const isMyCol  = !spectator && idx === playerIndex;
                  const pName    = gameState.players[idx]?.name ?? `Seat ${idx + 1}`;
                  const bid      = lastRound.bids[idx];
                  const tricks   = lastRound.tricks[idx];
                  const delta    = lastRound.scores[idx];
                  const total    = gameState.scores[idx];
                  const isNil    = bid === 0;
                  const nilMade   = isNil && tricks === 0;
                  const nilBroken = isNil && tricks > 0;
                  const made      = !isNil && tricks >= bid;
                  const newBags  = lastRound.bags[idx];
                  const bagThreshold  = (gameState.matchTarget ?? 250) >= 500 ? 10 : 5;
                  const bagPenaltyAmt = (gameState.matchTarget ?? 250) >= 500 ? 100 : 50;
                  const bagsTaken = isNil ? (nilBroken ? tricks : 0) : Math.max(0, tricks - bid);
                  const freshBags = prevBags[idx] + bagsTaken;
                  const bagPenalty = Math.floor(freshBags / bagThreshold) * bagPenaltyAmt;

                  return (
                    <div key={idx} className={`space-y-2 p-3 sm:space-y-3 sm:p-5 rounded-lg ${isMyCol ? "bg-primary/10 border border-primary/20" : "bg-white/5"}`}>
                      <div className="text-[11px] sm:text-sm text-muted-foreground uppercase tracking-wider truncate">{pName}</div>

                      <div className="text-xs sm:text-base space-y-1.5 sm:space-y-2 text-left">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bid</span>
                          <span className="font-mono">{bid === 0 ? "Nil" : bid}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tricks</span>
                          <span className={`font-mono ${made && !isNil ? "text-green-400" : !made && !isNil ? "text-red-400" : ""}`}>{tricks}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-1">
                          <span className="text-muted-foreground">Score</span>
                          <span className={`font-mono font-bold ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {delta >= 0 ? "+" : ""}{delta}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-mono">{total}</span>
                        </div>
                        {bagsTaken > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bags</span>
                            <span className="font-mono text-muted-foreground">
                              +{bagsTaken} → {newBags}
                            </span>
                          </div>
                        )}
                        {bagPenalty > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bag penalty</span>
                            <span className="font-mono text-red-400">−{bagPenalty}</span>
                          </div>
                        )}
                      </div>

                      {nilMade   && <div className="text-[11px] sm:text-sm text-green-400 font-semibold">✓ Nil made</div>}
                      {nilBroken && <div className="text-[11px] sm:text-sm text-red-400 font-semibold">✗ Nil broken</div>}
                      {!isNil && made && tricks > bid && (
                        <div className="text-[11px] sm:text-sm text-yellow-400">+{tricks - bid} bag{tricks - bid !== 1 ? "s" : ""}</div>
                      )}
                      {!isNil && !made && (
                        <div className="text-[11px] sm:text-sm text-red-400">Set — missed by {bid - tricks}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-1 space-y-3">
                {roundNextCountdown !== null && (
                  <div
                    data-testid="next-round-countdown"
                    className="rounded-lg border border-primary/35 bg-black/35 px-4 py-2.5 sm:py-3 text-center"
                  >
                    <div className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.28em] text-primary/80">
                      Next round
                    </div>
                    <div className="mt-1 font-serif text-xl sm:text-3xl font-bold text-primary">
                      Starting in {roundNextCountdown}
                    </div>
                  </div>
                )}
                {spectator ? (
                  <p className="text-center text-muted-foreground italic text-sm">Waiting for the next round…</p>
                ) : playerIndex === 0 ? (
                  <Button onClick={handleNextRound} className="w-full h-11 text-base">
                    Start Next Round Now →
                  </Button>
                ) : (
                  <p className="text-center text-muted-foreground italic text-sm">Waiting for the next round…</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Game over overlay (shown to everyone) */}
        {gameState.phase === "game_over" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg overflow-y-auto p-4">
            <div className="bg-card border border-border p-6 rounded-xl shadow-2xl max-w-sm w-full text-center space-y-5 my-auto">
              {gameState.matchLabel && (
                <div
                  data-testid="match-label"
                  className="inline-block px-3 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-widest"
                >
                  {gameState.matchLabel}
                </div>
              )}
              <h3 className="text-4xl font-serif text-primary">Game Over</h3>
              <div>
                {(() => {
                  const s0 = gameState.scores[0], s1 = gameState.scores[1];
                  const explicitWinner = gameState.winnerSeat ?? null;
                  if (spectator) {
                    if (explicitWinner === null && s0 === s1) return <p className="text-2xl font-bold text-yellow-400">Draw.</p>;
                    const winnerIdx = explicitWinner ?? (s0 > s1 ? 0 : 1);
                    const winnerName = gameState.players[winnerIdx]?.name ?? `Seat ${winnerIdx + 1}`;
                    return <p className="text-2xl font-bold text-green-400">{winnerName} wins 🏆</p>;
                  }
                  const mySeat = playerIndex as 0 | 1;
                  if (explicitWinner !== null) {
                    return explicitWinner === mySeat
                      ? <p className="text-2xl font-bold text-green-400">You Won! 🏆</p>
                      : <p className="text-2xl font-bold text-red-400">You Lost.</p>;
                  }
                  const my = gameState.scores[mySeat];
                  const opp = gameState.scores[playerIndex === 0 ? 1 : 0];
                  if (my > opp) return <p className="text-2xl font-bold text-green-400">You Won! 🏆</p>;
                  if (my < opp) return <p className="text-2xl font-bold text-red-400">You Lost.</p>;
                  return <p className="text-2xl font-bold text-yellow-400">It's a Draw.</p>;
                })()}
                <p className="text-xs text-muted-foreground mt-1">
                  First to {gameState.matchTarget} points
                </p>
                {gameState.gameOverReason && (
                  <p
                    data-testid="game-over-reason"
                    className="text-sm font-semibold text-red-300 mt-2"
                  >
                    {gameState.gameOverReason}
                  </p>
                )}
              </div>
              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{gameState.players[0]?.name ?? "Seat 1"}</span>
                  <span>{gameState.players[1]?.name ?? "Seat 2"}</span>
                </div>
                <div className="flex justify-between text-3xl font-mono font-bold">
                  <span className={(gameState.winnerSeat ?? (gameState.scores[0] > gameState.scores[1] ? 0 : null)) === 0 ? "text-green-400" : ""}>{gameState.scores[0]}</span>
                  <span className="text-muted-foreground text-lg self-center">vs</span>
                  <span className={(gameState.winnerSeat ?? (gameState.scores[1] > gameState.scores[0] ? 1 : null)) === 1 ? "text-green-400" : ""}>{gameState.scores[1]}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{gameState.bags[0]} bags</span>
                  <span>{gameState.bags[1]} bags</span>
                </div>
                <div className="border-t border-white/10 pt-2 text-xs text-muted-foreground">
                  Rounds played: <span className="font-mono text-foreground">{gameState.roundHistory.length}</span>
                </div>
              </div>

              {/* Tournament result copy block — plain text + Discord-formatted */}
              {(() => {
                const s0 = gameState.scores[0], s1 = gameState.scores[1];
                const n0 = gameState.players[0]?.name ?? "Seat 1";
                const n1 = gameState.players[1]?.name ?? "Seat 2";
                const explicitWinner = gameState.winnerSeat ?? null;
                const tie = explicitWinner === null && s0 === s1;
                const winIdx = explicitWinner ?? (s0 >= s1 ? 0 : 1);
                const loseIdx = winIdx === 0 ? 1 : 0;
                const winName = [n0, n1][winIdx];
                const loseName = [n0, n1][loseIdx];
                const winScore = [s0, s1][winIdx];
                const loseScore = [s0, s1][loseIdx];
                const rounds = gameState.roundHistory.length;
                const ts = new Date().toLocaleString(undefined, {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                });

                const lines = [
                  gameState.matchLabel ? `Match: ${gameState.matchLabel}` : null,
                  tie ? `Winner: Draw` : `Winner: ${winName}`,
                  tie
                    ? `Final: ${n0} ${s0} - ${n1} ${s1}`
                    : `Final: ${winName} ${winScore} - ${loseName} ${loseScore}`,
                  `Rounds: ${rounds}`,
                  `Match Target: ${gameState.matchTarget}`,
                  `Room: ${roomCode}`,
                  `Time: ${ts}`,
                ].filter(Boolean);

                const plain = lines.join("\n");
                const discord = "```\n" + plain + "\n```";

                return (
                  <div className="space-y-2 text-left">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest text-center">Report result</p>
                    <pre
                      data-testid="report-text"
                      className="text-[11px] leading-snug font-mono bg-black/40 border border-border rounded-md p-3 whitespace-pre-wrap break-words max-h-32 overflow-y-auto text-left"
                    >{discord}</pre>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(plain, "Final result")}
                        data-testid="button-copy-result"
                      >
                        📋 Copy result
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(discord, "Shareable report")}
                        data-testid="button-copy-shareable-report"
                      >
                        Copy shareable report
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                {isKingMode ? (
                  (() => {
                    const myScore = gameState.scores[playerIndex as 0 | 1];
                    const oppScore = gameState.scores[playerIndex === 0 ? 1 : 0];
                    const iWon = !spectator && myScore > oppScore;
                    const iLost = !spectator && myScore < oppScore;
                    // Use the unified table-holder (winner, or null on a tie)
                    // rather than a raw score compare that would mislabel a tie.
                    const winnerName = tableHolderName;

                    // A challenger is queued — automatic rotation is imminent for
                    // everyone (winner, loser, and spectators).
                    if (queue.length > 0) {
                      return (
                        <div
                          data-testid="kott-next-banner"
                          className="text-center text-sm space-y-1 rounded-md border border-primary/40 bg-primary/10 p-3"
                        >
                          <p className="font-semibold text-primary">
                            Next challenger: {queue[0]?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            New match starts in a few seconds…
                          </p>
                        </div>
                      );
                    }

                    // No challenger queued. The winner holds the table as King.
                    // Keep the challenger invite link right here so the King can
                    // always recruit the next challenger without leaving the
                    // game-over screen (the link must never disappear post-match).
                    if (iWon) {
                      return (
                        <div
                          data-testid="kott-king-waiting"
                          className="text-center text-sm space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3"
                        >
                          <p className="font-semibold text-primary">👑 You are the King</p>
                          <p className="text-xs text-muted-foreground">
                            Waiting for a challenger to join…
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => copyToClipboard(buildLink(false), "Challenger link")}
                            data-testid="button-copy-challenger-link-gameover"
                            className="w-full h-10 border-primary/40 hover:bg-primary/10"
                          >
                            🔗 Copy Challenger Link
                          </Button>
                        </div>
                      );
                    }

                    // No challenger queued and I'm the seated LOSER — never strand
                    // me. Offer a clear rematch, a step-down-to-spectate option,
                    // plus the Leave Table button rendered below. (The server is
                    // authoritative: only the losing seat may step down.)
                    if (iLost) {
                      return (
                        <div className="space-y-2">
                          <p
                            data-testid="kott-loser-prompt"
                            className="text-center text-sm text-muted-foreground"
                          >
                            {winnerName ? `${winnerName} holds the table.` : "The match is over."}{" "}
                            What next?
                          </p>
                          <Button
                            onClick={handleKottRejoinQueue}
                            className="w-full h-11"
                            data-testid="button-kott-rejoin-queue"
                          >
                            🔁 Rejoin Queue (Rematch)
                          </Button>
                          <Button
                            onClick={handleKottBackToLobby}
                            variant="outline"
                            className="w-full h-11"
                            data-testid="button-kott-back-to-lobby"
                          >
                            Back to Table Streak Lobby
                          </Button>
                        </div>
                      );
                    }

                    // Spectator with no challenger queued — the King is waiting.
                    // Surface the current King clearly and keep a token-free
                    // challenger link handy so watchers can recruit a challenger.
                    return (
                      <div
                        data-testid="kott-waiting-banner"
                        className="text-center text-sm space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3"
                      >
                        <p className="font-semibold text-primary">
                          👑 {winnerName ? `${winnerName} is King` : "King is on the table"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Waiting for a challenger to join…
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => copyToClipboard(buildLink(false), "Challenger link")}
                          data-testid="button-copy-challenger-link-spectator"
                          className="w-full h-10 border-primary/40 hover:bg-primary/10"
                        >
                          🔗 Copy Challenger Link
                        </Button>
                      </div>
                    );
                  })()
                ) : gameState.tournamentRef ? null : spectator ? (
                  <p className="text-center text-muted-foreground italic text-sm">Match complete. Return to the lobby to play again.</p>
                ) : (
                  <p className="text-center text-muted-foreground italic text-sm">Match complete. Return to the lobby to create or join the next game.</p>
                )}
                {isKingMode && spectator && !inQueue && (
                  <Button
                    onClick={handleJoinQueue}
                    variant="outline"
                    className="w-full h-11"
                    data-testid="button-join-queue-gameover"
                  >
                    Join as Challenger
                  </Button>
                )}
                {isKingMode && isAdmin && (
                  <Button
                    onClick={handleResetTable}
                    variant="destructive"
                    className="w-full h-11"
                    data-testid="button-reset-table-gameover"
                  >
                    Reset Table
                  </Button>
                )}
                {gameState.tournamentRef && (
                  <Button
                    onClick={() => handleLeaveCompletedRoom(`/tournament/${gameState.tournamentRef!.code}`)}
                    className="w-full h-11"
                    data-testid="button-back-to-tournament"
                  >
                    Back to Tournament Bracket
                  </Button>
                )}
                <Button
                  onClick={spectator ? handleLeaveSpectate : () => handleLeaveCompletedRoom("/")}
                  variant="outline"
                  className="w-full h-11"
                  data-testid="button-leave-gameover"
                >
                  {spectator ? "Leave" : isKingMode ? "Leave Table" : "Return to Lobby"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── My hand (players only) ─────────────────────────────────────────────────
  // Groups cards by suit and sorts high-to-low. No overlap so every card
  // is a full tap target on mobile. Suit groups are visually separated.
  const renderMyHand = () => {
    const groups = sortHandBySuit(gameState.hand);
    const biddingNow = gameState.phase === "bidding";
    const playingNow = gameState.phase === "playing";
    const isMyPlayTurn = playingNow && gameState.currentTurnIndex === playerIndex;
    const playableCards = gameState.hand.filter((card) =>
      isCardPlayable(card, gameState, playerIndex as 0 | 1)
    );
    const handHint = biddingNow
      ? "Review your cards, then choose a bid."
      : isMyPlayTurn
        ? `Your turn: tap a highlighted card${playableCards.length > 1 ? ` (${playableCards.length} legal)` : ""}.`
        : playingNow
          ? "Opponent's turn: wait for the other player to play."
          : "Your hand";
    return (
      <div
        data-testid="my-hand"
        className={cn(
          "spades-hand-tray relative flex-shrink-0 overflow-x-auto overflow-y-hidden snap-x pt-2 pb-hand-safe border-t shadow-[0_-10px_34px_-24px_hsla(35,90%,55%,0.5)] touch-pan-x",
          biddingNow && "z-[130] ring-1 ring-primary/35",
          isMyPlayTurn && "ring-2 ring-emerald-400/50"
        )}
      >
        <div
          data-testid="hand-turn-hint"
          className={cn(
            "sticky left-0 z-10 mx-2 mb-2 w-[calc(100vw-1rem)] rounded-lg border px-3 py-2 text-center text-xs font-bold uppercase tracking-widest backdrop-blur-sm sm:mx-3 sm:w-[calc(100vw-1.5rem)]",
            isMyPlayTurn
              ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
              : playingNow
                ? "border-yellow-400/45 bg-yellow-500/10 text-yellow-200"
                : "border-primary/35 bg-black/45 text-primary"
          )}
        >
          {handHint}
        </div>
        <div className="flex flex-nowrap items-end gap-1 px-2 sm:gap-2 sm:px-3 sm:justify-center min-w-min">
          {groups.map((group, gi) => (
            <div
              key={group.suit}
              data-testid={`hand-group-${group.suit}`}
              className={cn(
                "flex flex-nowrap items-end gap-1",
                gi > 0 && "ml-1 sm:ml-2 border-l border-white/10 pl-1 sm:pl-2"
              )}
            >
              {group.cards.map((card) => {
                const playable = isCardPlayable(card, gameState, playerIndex as 0 | 1);
                // Only dim during the playing phase on YOUR turn — illegal cards
                // get a muted look so legal ones stand out. Never dim during
                // bidding or on the opponent's turn (cards must stay readable).
                return (
                  <CardComponent
                    key={`${card.suit}-${card.rank}`}
                    card={card}
                    onClick={playable ? () => handlePlayCard(card) : undefined}
                    disabled={!playable}
                    dimmed={isMyPlayTurn && !playable}
                    className={cn(
                      "snap-center",
                      playable && "ring-4 ring-emerald-400 ring-offset-2 ring-offset-background -translate-y-1 shadow-[0_0_22px_rgba(52,211,153,0.45)]"
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── King of the Table: challenger queue panel (visible to all) ────────────
  const renderQueuePanel = () => {
    if (!isKingMode) return null;
    return (
      <div
        data-testid="kott-queue-panel"
        className="px-4 py-2 bg-black/40 border-b border-primary/20 flex flex-col gap-1.5 text-xs"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="border-yellow-500/50 text-yellow-300 uppercase tracking-widest"
          >
            Table Streak
          </Badge>
          {/* Clear session/lobby state for the stream. */}
          {kottLobbyState && (
            <Badge
              variant="outline"
              data-testid="kott-lobby-state"
              className="border-primary/40 text-primary/90 uppercase tracking-wider text-[10px]"
            >
              {kottLobbyState}
            </Badge>
          )}
          {/* Current King — clearly surfaced for the stream. The lone seated
              player holds the table as King-in-waiting even before any win. */}
          {tableHolderName ? (
            <span data-testid="kott-current-king" className="font-semibold text-yellow-300">
              King: {tableHolderName}
              {kingStreakVal > 0 ? (
                <span className="ml-1 font-mono text-[10px] align-top">×{kingStreakVal}</span>
              ) : (
                <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-yellow-300/70">
                  (holding the table)
                </span>
              )}
            </span>
          ) : (
            <span data-testid="kott-current-king" className="text-muted-foreground italic">
              No King yet
            </span>
          )}
          {spectator && (
            inQueue ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLeaveQueue}
                data-testid="button-leave-queue"
                className="h-7 text-xs ml-auto"
              >
                Leave Queue (#{queuePosition + 1})
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleJoinQueue}
                data-testid="button-join-queue"
                className="h-7 text-xs ml-auto"
              >
                Join as Challenger
              </Button>
            )
          )}
          {/* Host-only: Reset Table (admin/streamer). */}
          {isAdmin && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleResetTable}
              data-testid="button-reset-table"
              className={cn("h-7 text-xs", spectator ? "" : "ml-auto")}
            >
              Reset Table
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {queue.length === 0 ? (
            <span className="text-muted-foreground italic">No challengers in line yet.</span>
          ) : (
            <>
              <span className="text-muted-foreground">Next up:</span>
              {queue.slice(0, isAdmin ? 12 : 5).map((c, i) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  <Badge
                    variant="outline"
                    data-testid={`queue-slot-${i}`}
                    className={cn(
                      "text-xs font-mono",
                      i === 0
                        ? "border-primary/60 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {i + 1}. {c.name}
                  </Badge>
                  {/* Host-only per-challenger controls. */}
                  {isAdmin && (
                    <>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSetNextChallenger(c.id)}
                          data-testid={`button-set-next-${i}`}
                          title="Move to front of queue"
                          className="text-[10px] text-primary hover:underline"
                        >
                          ↑next
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveFromQueue(c.id)}
                        data-testid={`button-remove-queue-${i}`}
                        title="Remove from queue"
                        className="text-[10px] text-destructive hover:underline"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </span>
              ))}
              {!isAdmin && queue.length > 5 && (
                <span className="text-muted-foreground">+{queue.length - 5} more</span>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Spectator footer ──────────────────────────────────────────────────────
  const renderSpectatorFooter = () => (
    <div
      data-testid="spectator-footer"
      className="flex items-center justify-between px-4 py-3 pb-safe bg-black/50 border-t border-border text-xs"
    >
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="border-primary/40 text-primary uppercase tracking-widest">
          Spectator
        </Badge>
        <span className="text-muted-foreground">
          Room <span className="font-mono text-foreground">{roomCode}</span>
          {gameState.matchLabel && (
            <>{" · "}<span className="font-semibold text-primary" data-testid="match-label">{gameState.matchLabel}</span></>
          )}
          {" · "}
          Round <span className="font-mono text-foreground">{gameState.roundNumber || "—"}</span>
          {" · "}
          Target <span className="font-mono text-foreground">{gameState.matchTarget}</span>
          {(gameState.spectatorCount ?? 0) > 1 && (
            <>{" · "}<span className="font-mono text-foreground">{gameState.spectatorCount}</span> watching</>
          )}
        </span>
      </div>
      <Button size="sm" variant="ghost" onClick={handleLeaveSpectate} className="h-8 text-xs">
        Leave
      </Button>
    </div>
  );

  // ── Last Hand Played (centered, inline below the trick area) ──────────────
  const renderLastTrickMini = () => {
    if (gameState.phase === "waiting" || gameState.phase === "coin_toss") return null;
    const last = gameState.lastCompletedTrick ?? [];
    const seat0Card = last.find(t => t.playerIndex === 0)?.card ?? null;
    const seat1Card = last.find(t => t.playerIndex === 1)?.card ?? null;
    const renderCard = (c: CardType | null) => {
      if (!c) return <span className="text-muted-foreground/70">—</span>;
      const isRed = c.suit === "hearts" || c.suit === "diamonds";
      return (
        <span className={`tabular-nums font-bold ${isRed ? "text-rose-400" : "text-foreground"}`}>
          {formatCard(c)}
        </span>
      );
    };
    return (
      <div
        id="lastCompletedTrickDisplay"
        data-testid="last-trick-mini"
        className="mt-3 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg border border-primary/50 bg-black/70 backdrop-blur-sm shadow-md pointer-events-none max-w-full"
      >
        <div className="text-[9px] sm:text-[10px] uppercase tracking-[1.5px] text-primary font-semibold leading-none">
          Last Hand Played
        </div>
        <div className="flex items-center justify-center gap-3 text-[11px] sm:text-[12px] leading-tight whitespace-nowrap">
          <span data-testid="last-trick-seat-1">
            <span className="text-muted-foreground mr-1">S1:</span>{renderCard(seat0Card)}
          </span>
          <span data-testid="last-trick-seat-2">
            <span className="text-muted-foreground mr-1">S2:</span>{renderCard(seat1Card)}
          </span>
        </div>
      </div>
    );
  };

  // ── Root layout ────────────────────────────────────────────────────────────
  // Spectator: never see the waiting screen as theirs — show a neutral version
  // Spectator that joined before host hits "Start" — show waiting screen.
  // (Coin toss and beyond render the normal table layout with overlay.)
  // ADMIN-ONLY floating "Reset Room" — visible during play (not waiting/game_over,
  // since those screens already have their own actions). Gated on isAdmin (the
  // secret-key streamer/host), never on the seat-0 room host.
  const showHostResetFab =
    isAdmin &&
    gameState.phase !== "waiting" &&
    gameState.phase !== "game_over";

  // Opponent-offline indicator. The server preserves the seat and arms a grace
  // window on disconnect; this surfaces that state to the still-connected player
  // (and spectators) so nobody assumes the opponent rage-quit. Driven by the
  // `error` string set on `opponent_disconnected` and cleared on reconnect.
  const opponentOffline = !!error && /disconnect/i.test(error);
  const renderOpponentOffline = () =>
    opponentOffline ? (
      <div
        role="status"
        aria-live="polite"
        data-testid="banner-opponent-offline"
        className="absolute top-2 left-1/2 -translate-x-1/2 z-[55] inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/90 px-3 py-1 text-[11px] font-semibold text-amber-200 shadow-lg backdrop-blur-sm"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Opponent disconnected — waiting for them to reconnect…
      </div>
    ) : null;

  const renderHostResetFab = () => (
    <button
      type="button"
      onClick={handleResetRoom}
      disabled={isResetting}
      data-testid="button-reset-room-fab"
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] right-3 z-[55] px-3 py-1.5 rounded-full border border-red-500/40 bg-black/70 text-red-300 text-[10px] font-semibold uppercase tracking-widest backdrop-blur-sm shadow-lg hover:bg-red-500/10 active:scale-95 transition disabled:opacity-50"
    >
      {isResetting ? "Resetting…" : "↺ Reset Room"}
    </button>
  );

  const renderForfeitControl = () =>
    canForfeit ? (
      <>
        <button
          type="button"
          onClick={() => setForfeitConfirmOpen(true)}
          data-testid="button-forfeit"
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] left-3 z-[55] px-3 py-1.5 rounded-full border border-red-500/45 bg-black/75 text-red-200 text-[10px] font-semibold uppercase tracking-widest backdrop-blur-sm shadow-lg hover:bg-red-500/10 active:scale-95 transition"
        >
          Forfeit
        </button>
        {forfeitConfirmOpen && (
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4"
            data-testid="forfeit-confirm-overlay"
            onClick={() => setForfeitConfirmOpen(false)}
          >
            <div
              className="bg-card border border-red-500/35 rounded-xl shadow-2xl p-5 max-w-sm w-full space-y-4 text-center"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="font-serif text-xl text-primary">Forfeit game?</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to forfeit this game?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForfeitConfirmOpen(false)}
                  data-testid="button-forfeit-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleConfirmForfeit}
                  data-testid="button-forfeit-confirm"
                >
                  Forfeit
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    ) : null;

  // Host Fast Finish / End Game test tool. ADMIN-ONLY: shown ONLY to a socket
  // unlocked with the secret host key (the streamer/host, even when spectating
  // a KotT/tournament table). There is deliberately NO dev/preview path —
  // preview URLs are shareable, so an env-based grant leaked this match-ending
  // tool to ordinary players and challengers. The server independently enforces
  // the same admin-only rule; this gate just keeps the button off everyone
  // else's screen.
  const canFastFinish =
    isAdmin &&
    gameState.phase !== "waiting" &&
    gameState.phase !== "game_over";

  const renderFastFinishTool = () => {
    const seat1Name = gameState.players[0]?.name ?? "Seat 1";
    const seat2Name = gameState.players[1]?.name ?? "Seat 2";
    return (
      <>
        <button
          type="button"
          onClick={() => setFastFinishOpen(true)}
          data-testid="button-fast-finish"
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] right-3 z-[55] px-3 py-1.5 rounded-full border border-amber-400/40 bg-black/70 text-amber-300 text-[10px] font-semibold uppercase tracking-widest backdrop-blur-sm shadow-lg hover:bg-amber-400/10 active:scale-95 transition"
        >
          ⏩ Fast Finish
        </button>
        {fastFinishOpen && (
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4"
            data-testid="fast-finish-overlay"
            onClick={() => !fastFinishing && setFastFinishOpen(false)}
          >
            <div
              className="bg-card border border-amber-400/30 rounded-xl shadow-2xl p-5 max-w-sm w-full space-y-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-amber-300/80">
                  Dev / Host testing tool
                </p>
                <h3 className="text-lg font-serif text-primary">End this match for testing?</h3>
                <p className="text-xs text-muted-foreground">
                  Pick the winner. This ends the match through the normal game-over
                  flow (tournament bracket advances, King stays King).
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={() => handleFastFinish(0)}
                  disabled={fastFinishing}
                  data-testid="button-fast-finish-seat1"
                  className="w-full"
                >
                  {fastFinishing ? "Ending…" : `Seat 1 wins — ${seat1Name}`}
                </Button>
                <Button
                  onClick={() => handleFastFinish(1)}
                  disabled={fastFinishing}
                  data-testid="button-fast-finish-seat2"
                  className="w-full"
                >
                  {fastFinishing ? "Ending…" : `Seat 2 wins — ${seat2Name}`}
                </Button>
              </div>
              <Button
                variant="ghost"
                onClick={() => setFastFinishOpen(false)}
                disabled={fastFinishing}
                data-testid="button-fast-finish-cancel"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </>
    );
  };

  if (spectator && gameState.phase === "waiting") {
    return (
      <div className="spades-screen spades-gameplay-screen min-h-[100dvh] sm:h-[100dvh] flex flex-col bg-background overflow-y-auto overflow-x-hidden sm:overflow-hidden relative">
        {renderStatusPill()}
        {renderOpponentOffline()}
        {renderQueuePanel()}
        {renderSpectatorWaiting()}
        {renderSpectatorFooter()}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "spades-screen spades-gameplay-screen flex flex-col bg-background overflow-x-hidden relative",
        gameState.phase === "waiting"
          ? "min-h-[100dvh] sm:h-[100dvh] overflow-y-auto sm:overflow-hidden"
          : "h-[100dvh] min-h-[100dvh] overflow-hidden"
      )}
    >
      {renderStatusPill()}
      {renderOpponentOffline()}
      {!spectator && gameState.phase === "waiting" ? (
        <>
          {renderQueuePanel()}
          {renderWaiting()}
        </>
      ) : (
        <>
          {renderPlayerInfo(topIndex, { isTopSeat: true })}
          {renderRoomCodeStrip()}
          {renderQueuePanel()}
          {renderStatusBanner()}
          {renderTable()}
          {renderPlayerInfo(bottomIndex)}
          {spectator ? renderSpectatorFooter() : renderMyHand()}
          {renderForfeitControl()}
          {showHostResetFab && renderHostResetFab()}
          {canFastFinish && renderFastFinishTool()}
        </>
      )}
    </div>
  );
}
