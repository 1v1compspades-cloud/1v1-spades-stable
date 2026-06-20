import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import type { AccountIdentityPayload } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ConnectionPill } from "@/components/ConnectionPill";
import { InfoMenu } from "@/components/InfoMenu";
import { LegalFooter, MatchAgreementNotice } from "@/components/LegalFooter";
import { PreGameChecklist } from "@/components/PreGameChecklist";
import { V11LeaderboardPanel } from "@/components/V11LeaderboardPanel";
import { v11WebFlags } from "@/lib/v11Flags";

type FindMatchMatchedPayload = {
  roomCode?: string;
  playerIndex?: 0 | 1;
  token?: string;
  route?: string;
};

type FindMatchErrorPayload = {
  code?: string;
  message?: string;
};

type OnlineCountUpdate = {
  onlineCount: number;
  findingMatchCount: number;
};

export default function Lobby() {
  const [, setLocation] = useLocation();
  const { connect, connected, socket, createRoom, joinRoom, joinAsSpectator, createTournament, joinTournament, isAdmin, unlockAdmin } = useSocket();
  const {
    playerName,
    profileUsername,
    accountId,
    accountUsername,
    roomCode: storedRoomCode,
    playerIndex: storedPlayerIndex,
    savePlayerName,
    saveProfileUsername,
    saveAccountIdentity,
    clearAccountIdentity,
    saveRoomCode,
    savePlayerIndex,
    saveIsSpectator,
    saveTournamentToken,
    getTournamentToken,
    savePlayerToken,
    getPlayerToken,
  } = useGameStorage();
  const { toast } = useToast();

  // Parse ?room=XXX&mode=spectator from the URL (once on mount)
  const initialParams = (() => {
    if (typeof window === "undefined") return { code: "", spectate: false };
    const sp = new URLSearchParams(window.location.search);
    const code = (sp.get("room") || "").toUpperCase().trim();
    const spectate = sp.get("mode") === "spectator";
    return { code, spectate };
  })();

  const [nameInput, setNameInput] = useState(playerName);
  const [profileInput, setProfileInput] = useState(profileUsername);
  const [accountDisplayNameInput, setAccountDisplayNameInput] = useState(playerName);
  const [accountUsernameInput, setAccountUsernameInput] = useState(accountUsername);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState(initialParams.code);
  const [matchTarget, setMatchTarget] = useState<250 | 500>(250);
  const [tournamentSize, setTournamentSize] = useState<4 | 8 | 16 | 32>(4);
  const [tournamentName, setTournamentName] = useState<string>("");
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const ALL_MATCH_MODES = [
    { id: "quick",     label: "Quick Match",          blurb: "Single head-to-head match" },
    { id: "king",      label: "Table Streak",         blurb: "Winner stays, next player joins" },
    { id: "custom",    label: "Private Event",        blurb: "Host-managed invite bracket" },
  ] as const;
  type MatchMode = typeof ALL_MATCH_MODES[number]["id"];
  // Tournaments are admin-only: the Custom Tournament tile is hidden from
  // normal players entirely. The server also rejects create/join/manage from
  // non-admin sockets, so this is purely a UX gate.
  const MATCH_MODES = ALL_MATCH_MODES.filter((m) => m.id !== "custom" || isAdmin);
  const [matchMode, setMatchMode] = useState<MatchMode>("quick");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isSpectating, setIsSpectating] = useState(false);
  const [isFindingMatch, setIsFindingMatch] = useState(false);
  const [isFindingRankedMatch, setIsFindingRankedMatch] = useState(false);
  const [findMatchError, setFindMatchError] = useState<string | null>(null);
  const [rankedMatchError, setRankedMatchError] = useState<string | null>(null);
  const [onlineCounts, setOnlineCounts] = useState<OnlineCountUpdate | null>(null);
  const findMatchCleanupRef = useRef<(() => void) | null>(null);
  const rankedMatchCleanupRef = useRef<(() => void) | null>(null);
  const [invitedAsSpectator] = useState(initialParams.spectate && !!initialParams.code);
  const [autoSpectateTried, setAutoSpectateTried] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [adminUnlocking, setAdminUnlocking] = useState(false);
  const hasGuestName = !!nameInput.trim();
  const hasRankedAccount = !!accountId.trim() && !!accountUsername.trim();
  const savedRoomCode = storedRoomCode.toUpperCase().trim();
  const getSavedPlayerSession = (code: string): { seat: 0 | 1; token: string } | null => {
    const normalized = code.toUpperCase().trim();
    if (!normalized) return null;
    const seats: (0 | 1)[] = storedPlayerIndex !== null
      ? [storedPlayerIndex, storedPlayerIndex === 0 ? 1 : 0]
      : [0, 1];
    for (const seat of seats) {
      const token = getPlayerToken(normalized, seat);
      if (token) return { seat, token };
    }
    return null;
  };
  const savedPlayerSession = savedRoomCode ? getSavedPlayerSession(savedRoomCode) : null;
  const canReconnectToCurrentGame = !!savedRoomCode && !!savedPlayerSession;
  const activeGameMessage = "You are already in a game. Reconnect or forfeit first.";

  const blockIfActiveGame = (): boolean => {
    if (!canReconnectToCurrentGame) return false;
    toast({ description: activeGameMessage, variant: "destructive" });
    return true;
  };

  const optionalProfileUsername = (): string | undefined => {
    const normalized = profileInput.trim().replace(/\s+/g, " ").slice(0, 32);
    return normalized || undefined;
  };

  const optionalAccountIdentity = (): AccountIdentityPayload | undefined => {
    if (!v11WebFlags.accounts) return undefined;
    const id = accountId.trim();
    const username = accountUsername.trim();
    if (!id || !username) return undefined;
    return { accountId: id, accountUsername: username };
  };

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    if (!v11WebFlags.matchmaking || !socket) return;
    const onOnlineCountUpdate = (payload: OnlineCountUpdate) => {
      if (
        typeof payload?.onlineCount !== "number" ||
        typeof payload?.findingMatchCount !== "number"
      ) return;
      setOnlineCounts({
        onlineCount: Math.max(0, payload.onlineCount),
        findingMatchCount: Math.max(0, payload.findingMatchCount),
      });
    };
    socket.on("online_count_update", onOnlineCountUpdate);
    return () => {
      socket.off("online_count_update", onOnlineCountUpdate);
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      findMatchCleanupRef.current?.();
      rankedMatchCleanupRef.current?.();
    };
  }, [socket]);

  // If admin access is lost (e.g. session token rejected on reconnect) while
  // the Custom Tournament tile is selected, fall back to Quick Match so the
  // user isn't stuck on a hidden mode.
  useEffect(() => {
    if (!isAdmin && matchMode === "custom") setMatchMode("quick");
  }, [isAdmin, matchMode]);

  const handleAdminUnlock = async (): Promise<void> => {
    const key = adminKeyInput.trim();
    if (!key) return;
    setAdminUnlocking(true);
    try {
      await unlockAdmin(key);
      setAdminKeyInput("");
      setAdminDialogOpen(false);
      toast({ description: "Admin access unlocked." });
    } catch (err: any) {
      toast({ description: typeof err === "string" ? err : "Invalid admin key", variant: "destructive" });
    } finally {
      setAdminUnlocking(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    if (blockIfActiveGame()) return;
    setIsCreating(true);
    try {
      const displayName = nameInput.trim();
      const profile = optionalProfileUsername();
      savePlayerName(displayName);
      saveProfileUsername(profile ?? "");
      saveIsSpectator(false);
      if (matchMode === "custom") {
        // SECURITY: tournaments are admin-only and the admin is NOT seeded as a
        // player. No host token is stored — admin authority is the unlocked
        // socket (sessionStorage), validated server-side on every action. The
        // admin lands in the tournament lobby and can optionally Join as Player.
        const res = await createTournament({
          name: tournamentName.trim() || undefined,
          size: tournamentSize,
          matchTarget,
        });
        setLocation(`/tournament/${res.code}`);
        return;
      }
      const serverMode: "quick" | "king" = matchMode === "king" ? "king" : "quick";
      const res = await createRoom(
        displayName,
        matchTarget,
        undefined,
        serverMode,
        profile,
        optionalAccountIdentity(),
      );
      if (res.roomCode && res.playerIndex !== undefined) {
        saveRoomCode(res.roomCode);
        savePlayerIndex(res.playerIndex as 0 | 1);
        if (res.token) {
          savePlayerToken(res.roomCode, res.playerIndex as 0 | 1, res.token);
        }
        setLocation(`/room/${res.roomCode}`);
      }
    } catch (err: any) {
      toast({ description: err || "Failed to create", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleFindMatch = async (): Promise<void> => {
    if (!v11WebFlags.matchmaking) return;
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    if (blockIfActiveGame()) return;
    if (!socket) { toast({ description: "Connecting. Try again in a moment.", variant: "destructive" }); return; }

    const displayName = nameInput.trim();
    const profile = optionalProfileUsername();
    setFindMatchError(null);
    setIsFindingMatch(true);
    findMatchCleanupRef.current?.();
    savePlayerName(displayName);
    saveProfileUsername(profile ?? "");
    saveIsSpectator(false);

    const cleanup = () => {
      socket.off("find_match_waiting", onWaiting);
      socket.off("find_match_matched", onMatched);
      socket.off("find_match_cancelled", onCancelled);
      socket.off("find_match_error", onError);
      findMatchCleanupRef.current = null;
    };
    const onWaiting = () => {
      setFindMatchError(null);
      setIsFindingMatch(true);
    };
    const onMatched = (payload: FindMatchMatchedPayload) => {
      cleanup();
      const roomCode = payload?.roomCode?.toUpperCase().trim();
      const playerIndex = payload?.playerIndex;
      if (!roomCode || (playerIndex !== 0 && playerIndex !== 1)) {
        setIsFindingMatch(false);
        setFindMatchError("Match found, but the room details were incomplete.");
        return;
      }
      saveRoomCode(roomCode);
      savePlayerIndex(playerIndex);
      saveIsSpectator(false);
      if (payload.token) {
        savePlayerToken(roomCode, playerIndex, payload.token);
      }
      setIsFindingMatch(false);
      setLocation(`/room/${roomCode}`);
    };
    const onCancelled = () => {
      cleanup();
      setIsFindingMatch(false);
    };
    const onError = (payload: FindMatchErrorPayload) => {
      cleanup();
      setIsFindingMatch(false);
      setFindMatchError(payload?.message || "Find Match is unavailable right now.");
    };

    socket.off("find_match_waiting", onWaiting);
    socket.off("find_match_matched", onMatched);
    socket.off("find_match_cancelled", onCancelled);
    socket.off("find_match_error", onError);
    socket.on("find_match_waiting", onWaiting);
    socket.on("find_match_matched", onMatched);
    socket.on("find_match_cancelled", onCancelled);
    socket.on("find_match_error", onError);
    findMatchCleanupRef.current = cleanup;
    socket.emit("find_match_join", {
      playerName: displayName,
      profileUsername: profile,
      ...optionalAccountIdentity(),
    });
  };

  const handleCancelFindMatch = (): void => {
    socket?.emit("find_match_cancel");
    findMatchCleanupRef.current?.();
    setIsFindingMatch(false);
  };

  const handleRankedMatch = async (): Promise<void> => {
    if (!v11WebFlags.matchmaking || !v11WebFlags.accounts) return;
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    if (!hasRankedAccount) {
      setRankedMatchError("Create account to play ranked");
      return;
    }
    if (blockIfActiveGame()) return;
    if (!socket) { toast({ description: "Connecting. Try again in a moment.", variant: "destructive" }); return; }

    const displayName = nameInput.trim();
    const profile = accountUsername.trim();
    setRankedMatchError(null);
    setIsFindingRankedMatch(true);
    rankedMatchCleanupRef.current?.();
    savePlayerName(displayName);
    saveProfileUsername(profile);
    saveIsSpectator(false);

    const cleanup = () => {
      socket.off("ranked_match_waiting", onWaiting);
      socket.off("ranked_match_matched", onMatched);
      socket.off("ranked_match_cancelled", onCancelled);
      socket.off("ranked_match_error", onError);
      rankedMatchCleanupRef.current = null;
    };
    const onWaiting = () => {
      setRankedMatchError(null);
      setIsFindingRankedMatch(true);
    };
    const onMatched = (payload: FindMatchMatchedPayload) => {
      cleanup();
      const roomCode = payload?.roomCode?.toUpperCase().trim();
      const playerIndex = payload?.playerIndex;
      if (!roomCode || (playerIndex !== 0 && playerIndex !== 1)) {
        setIsFindingRankedMatch(false);
        setRankedMatchError("Ranked match found, but the room details were incomplete.");
        return;
      }
      saveRoomCode(roomCode);
      savePlayerIndex(playerIndex);
      saveIsSpectator(false);
      if (payload.token) {
        savePlayerToken(roomCode, playerIndex, payload.token);
      }
      setIsFindingRankedMatch(false);
      setLocation(`/room/${roomCode}`);
    };
    const onCancelled = () => {
      cleanup();
      setIsFindingRankedMatch(false);
    };
    const onError = (payload: FindMatchErrorPayload) => {
      cleanup();
      setIsFindingRankedMatch(false);
      setRankedMatchError(payload?.message || "Ranked Match is unavailable right now.");
    };

    socket.off("ranked_match_waiting", onWaiting);
    socket.off("ranked_match_matched", onMatched);
    socket.off("ranked_match_cancelled", onCancelled);
    socket.off("ranked_match_error", onError);
    socket.on("ranked_match_waiting", onWaiting);
    socket.on("ranked_match_matched", onMatched);
    socket.on("ranked_match_cancelled", onCancelled);
    socket.on("ranked_match_error", onError);
    rankedMatchCleanupRef.current = cleanup;
    socket.emit("ranked_match_join", {
      playerName: displayName,
      profileUsername: profile,
      accountId: accountId.trim(),
      accountUsername: accountUsername.trim(),
    });
  };

  const handleCancelRankedMatch = (): void => {
    socket?.emit("ranked_match_cancel");
    rankedMatchCleanupRef.current?.();
    setIsFindingRankedMatch(false);
  };

  const handleJoin = async (): Promise<void> => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    if (!joinCodeInput.trim()) { toast({ description: "Please enter a code", variant: "destructive" }); return; }
    setIsJoining(true);
    try {
      const displayName = nameInput.trim();
      const profile = optionalProfileUsername();
      savePlayerName(displayName);
      saveProfileUsername(profile ?? "");
      saveIsSpectator(false);
      const code = joinCodeInput.toUpperCase();
      if (matchMode === "custom") {
        if (blockIfActiveGame()) return;
        // Join the tournament lobby, then navigate to the tournament page.
        // If we already have a token cached for this code (e.g. reconnect from
        // the same browser), pass it so the server treats this as the same
        // seat rather than failing with "name taken".
        const existing = getTournamentToken(code);
        const res = await joinTournament(code, displayName, existing || undefined);
        saveTournamentToken(code, res.token);
        setLocation(`/tournament/${code}`);
        return;
      }
      try {
        const savedSession = getSavedPlayerSession(code);
        if (savedSession && code === savedRoomCode) {
          saveRoomCode(code);
          savePlayerIndex(savedSession.seat);
          setLocation(`/room/${code}?reconnect=1&seat=${savedSession.seat}`);
          return;
        }
        if (blockIfActiveGame()) return;
        const res = await joinRoom(code, displayName, profile, optionalAccountIdentity());
        if (res.playerIndex !== undefined) {
          saveRoomCode(code);
          savePlayerIndex(res.playerIndex as 0 | 1);
          if (res.token) {
            savePlayerToken(code, res.playerIndex as 0 | 1, res.token);
          }
          setLocation(`/room/${code}`);
        }
      } catch (joinErr: any) {
        const msg = String(joinErr || "");
        // King of the Table fallback: if both seats are full OR a match has
        // already started / just ended (King alone at game_over), slot the user
        // into the challenger queue + spectator list so they can watch and
        // auto-rotate in when a seat opens.
        if (matchMode === "king" && /(full|already started)/i.test(msg)) {
          await joinAsSpectator(code, displayName);
          try { await new Promise<void>((resolve, reject) => {
            if (!socket) return reject("No socket");
            socket.emit("join_queue", { roomCode: code, name: displayName }, (r: { ok: boolean; error?: string }) => r.ok ? resolve() : reject(r.error));
          }); } catch { /* spectator-only fallback is still fine */ }
          savePlayerIndex(null);
          saveIsSpectator(true);
          saveRoomCode(code);
          toast({ description: "Table is full — you're in the challenger queue." });
          setLocation(`/room/${code}`);
          return;
        }
        throw joinErr;
      }
    } catch (err: any) {
      toast({ description: err || "Failed to join", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  useEffect(() => {
    if (!invitedAsSpectator || autoSpectateTried) return;
    if (!connected) return;
    if (!nameInput.trim()) return;
    setAutoSpectateTried(true);
    void handleSpectate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitedAsSpectator, autoSpectateTried, connected, nameInput]);

  const handleSpectate = async (): Promise<void> => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    if (!joinCodeInput.trim()) { toast({ description: "Please enter a room code", variant: "destructive" }); return; }
    const code = joinCodeInput.toUpperCase();
    const displayName = nameInput.trim();
    const profile = optionalProfileUsername();
    setIsSpectating(true);
    try {
      savePlayerName(displayName);
      saveProfileUsername(profile ?? "");
      savePlayerIndex(null);
      saveIsSpectator(true);
      saveRoomCode(code);
      await joinAsSpectator(code, displayName);
      setLocation(`/room/${code}`);
    } catch (err: any) {
      saveIsSpectator(false);
      toast({ description: err || "Failed to join as spectator", variant: "destructive" });
    } finally {
      setIsSpectating(false);
    }
  };

  const handleReconnectToCurrentGame = (): void => {
    if (!savedPlayerSession) return;
    saveRoomCode(savedRoomCode);
    savePlayerIndex(savedPlayerSession.seat);
    saveIsSpectator(false);
    setLocation(`/room/${savedRoomCode}?reconnect=1&seat=${savedPlayerSession.seat}`);
  };

  const handleCreateAccount = async (): Promise<void> => {
    if (!v11WebFlags.accounts) return;
    const displayName = (accountDisplayNameInput || nameInput).trim();
    if (!displayName) {
      toast({ description: "Enter a display name first.", variant: "destructive" });
      return;
    }
    setAccountBusy(true);
    setAccountStatus(null);
    try {
      const res = await fetch("/api/v1.1/accounts/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const body = await res.json();
      if (!res.ok || !body?.account?.id) {
        throw new Error(body?.message || "Could not create account.");
      }
      saveAccountIdentity(body.account.id, "");
      setAccountUsernameInput("");
      setAccountStatus("Account created. Claim a username next.");
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Could not create account.",
        variant: "destructive",
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleClaimUsername = async (): Promise<void> => {
    if (!v11WebFlags.accounts) return;
    const id = accountId.trim();
    const username = accountUsernameInput.trim();
    if (!id) {
      toast({ description: "Create an account first.", variant: "destructive" });
      return;
    }
    if (!username) {
      toast({ description: "Enter a username first.", variant: "destructive" });
      return;
    }
    setAccountBusy(true);
    setAccountStatus(null);
    try {
      const res = await fetch("/api/v1.1/accounts/claim-username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: id, username }),
      });
      const body = await res.json();
      if (!res.ok || !body?.username?.displayUsername) {
        throw new Error(body?.message || "Could not claim username.");
      }
      saveAccountIdentity(id, body.username.displayUsername);
      saveProfileUsername(body.username.displayUsername);
      setProfileInput(body.username.displayUsername);
      setAccountStatus(`Using account username ${body.username.displayUsername}.`);
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Could not claim username.",
        variant: "destructive",
      });
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <div className="spades-screen min-h-[100dvh] flex items-center justify-center p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ConnectionPill />
      <InfoMenu />
      <Card className="spades-panel w-full max-w-md border-primary/30 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-3">
          <div className="flex items-center justify-center gap-2 text-primary text-lg" aria-hidden>
            <span>♠</span><span className="text-red-500">♥</span><span className="text-blue-500">♦</span><span className="text-emerald-500">♣</span>
          </div>
          <CardTitle className="text-[1.75rem] sm:text-4xl leading-tight font-serif text-primary tracking-wider drop-shadow-[0_2px_10px_rgba(234,179,8,0.34)]">
            SPADES FREE PLAY
          </CardTitle>
          <CardDescription className="text-sm font-medium text-foreground/80">
            Free head-to-head Spades for two players.
          </CardDescription>
          <p className="text-xs text-muted-foreground px-2 leading-relaxed">
            Create a room, send the code to your opponent, and play a live 1v1 match.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 mt-1">
          {initialParams.code && (
            <div
              className={`text-center text-sm rounded-md border px-3 py-2 ${
                invitedAsSpectator
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-white/5 text-muted-foreground"
              }`}
              data-testid="banner-invite"
            >
              {invitedAsSpectator
                ? <>You've been invited to <span className="font-mono">{initialParams.code}</span> as a spectator. Enter your name to start watching.</>
                : <>You've been invited to room <span className="font-mono">{initialParams.code}</span>. Enter your name and join.</>
              }
            </div>
          )}
          {canReconnectToCurrentGame && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReconnectToCurrentGame}
              className="w-full h-12 border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 hover:text-emerald-100"
              data-testid="button-reconnect-current-game"
            >
              Reconnect to Current Game
            </Button>
          )}
          <div
            className="space-y-2 rounded-md border border-primary/30 bg-primary/10 p-3"
            data-testid="guest-name-field"
          >
            <Label htmlFor="name" className="text-sm font-semibold text-foreground">
              Your Name
            </Label>
            <Input
              id="name"
              placeholder="Enter player name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoComplete="nickname"
              className="text-lg py-5 bg-background/90"
              data-testid="input-player-name"
            />
            <p className="text-xs text-muted-foreground">
              Guest display name for this match. No account username required.
            </p>
          </div>

          {v11WebFlags.matchmaking && matchMode === "quick" && (
            <div className="space-y-3 pt-1" data-testid="find-match-panel">
              {isFindingMatch ? (
                <div className="rounded-md border border-primary/35 bg-primary/10 px-3 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-primary">Finding opponent...</p>
                      <p className="text-xs text-muted-foreground">We'll send you to the room when a player joins.</p>
                    </div>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary animate-pulse" aria-hidden />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelFindMatch}
                    className="w-full"
                    data-testid="button-find-match-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    type="button"
                    onClick={() => void handleFindMatch()}
                    disabled={isCreating || isJoining || isSpectating || isFindingRankedMatch || !connected || !hasGuestName}
                    className="spades-gold-button w-full py-5 text-lg font-bold active:scale-[0.98] transition-transform"
                    data-testid="button-find-match"
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span>Play Now</span>
                      <span className="mt-1 text-xs font-semibold opacity-80">Quick casual match</span>
                    </span>
                  </Button>
                  <p
                    className="text-center text-xs font-medium text-muted-foreground"
                    data-testid="online-count-indicator"
                  >
                    Online: {onlineCounts?.onlineCount ?? "—"} · Finding match: {onlineCounts?.findingMatchCount ?? "—"}
                  </p>
                </div>
              )}
              {findMatchError && (
                <p className="text-xs text-destructive text-center" data-testid="find-match-error">
                  {findMatchError}
                </p>
              )}
            </div>
          )}

          <section className="space-y-3 pt-3 border-t border-border/50" data-testid="private-match-section">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Private Match</h2>
              <p className="text-xs text-muted-foreground">Create a room or join with a code.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                onClick={handleCreate}
                disabled={isCreating || isJoining || isSpectating || isFindingMatch || isFindingRankedMatch || !hasGuestName}
                className="spades-gold-button w-full py-5 text-lg font-bold active:scale-[0.98] transition-transform"
                data-testid="button-create"
              >
                {isCreating ? "Creating..." : matchMode === "custom" ? "Create Event" : "Create Room"}
              </Button>

              <div className="space-y-3">
                <Input
                  placeholder={matchMode === "custom" ? "Event code" : "Enter room code"}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (isCreating || isJoining || isSpectating || isFindingMatch || isFindingRankedMatch || !joinCodeInput.trim()) return;
                    e.preventDefault();
                    void handleJoin();
                  }}
                  className="text-center uppercase font-mono py-5 placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
                  maxLength={6}
                />
                <Button
                  onClick={handleJoin}
                  disabled={isCreating || isJoining || isSpectating || isFindingMatch || isFindingRankedMatch || !joinCodeInput || !hasGuestName}
                  variant="secondary"
                  className="w-full py-5 text-lg font-bold active:scale-[0.98] transition-transform"
                  data-testid="button-join"
                >
                  {isJoining ? "Joining..." : matchMode === "custom" ? "Join Event" : "Join Match"}
                </Button>
              </div>
            </div>
          </section>

          {v11WebFlags.matchmaking && v11WebFlags.accounts && matchMode === "quick" && (
            <section className="space-y-3" data-testid="ranked-match-section">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">Ranked Match</h2>
                <p className="text-xs text-muted-foreground">Account players only. Casual games stay unranked.</p>
              </div>
              {isFindingRankedMatch ? (
                <div className="rounded-md border border-primary/35 bg-primary/10 px-3 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-primary">Finding ranked opponent...</p>
                      <p className="text-xs text-muted-foreground">Only account players are matched here.</p>
                    </div>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary animate-pulse" aria-hidden />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelRankedMatch}
                    className="w-full"
                    data-testid="button-ranked-match-cancel"
                  >
                    Cancel Ranked Match
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleRankedMatch()}
                  disabled={isCreating || isJoining || isSpectating || isFindingMatch || !connected || !hasGuestName || !hasRankedAccount}
                  className="w-full py-5 text-lg font-bold active:scale-[0.98] transition-transform"
                  data-testid="button-ranked-match"
                >
                  {hasRankedAccount ? "Ranked Match (requires account)" : "Create account to play ranked"}
                </Button>
              )}
              {rankedMatchError && (
                <p className="text-xs text-destructive text-center" data-testid="ranked-match-error">
                  {rankedMatchError}
                </p>
              )}
            </section>
          )}

          {(v11WebFlags.usernames || v11WebFlags.accounts) && (
            <details
              open={accountPanelOpen}
              onToggle={(e) => setAccountPanelOpen(e.currentTarget.open)}
              className="rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-left"
              data-testid="v11-account-panel"
            >
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Ranked Profile
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Create a username to play ranked matches.
              </p>
              {accountPanelOpen && <div className="mt-3 space-y-4">
                {v11WebFlags.usernames && (
                  <div className="space-y-2">
                    <Label htmlFor="profile-username">Ranked Username</Label>
                    <Input
                      id="profile-username"
                      placeholder="Choose a username"
                      value={profileInput}
                      onChange={(e) => setProfileInput(e.target.value.slice(0, 32))}
                      className="text-lg py-6"
                      data-testid="input-profile-username"
                    />
                    <p className="text-xs text-muted-foreground">
                      Guest play still works without a ranked username.
                    </p>
                  </div>
                )}

                {v11WebFlags.accounts && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="account-display-name" className="text-xs">Display name</Label>
                      <Input
                        id="account-display-name"
                        value={accountDisplayNameInput}
                        onChange={(e) => setAccountDisplayNameInput(e.target.value.slice(0, 32))}
                        placeholder="Account display name"
                        disabled={accountBusy}
                        data-testid="input-v11-account-display-name"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCreateAccount()}
                      disabled={accountBusy || !accountDisplayNameInput.trim()}
                      className="w-full"
                      data-testid="button-v11-create-account"
                    >
                      {accountId ? "Create New Account" : "Create Account"}
                    </Button>
                    <div className="space-y-2">
                      <Label htmlFor="account-username" className="text-xs">Username</Label>
                      <Input
                        id="account-username"
                        value={accountUsernameInput}
                        onChange={(e) => setAccountUsernameInput(e.target.value.slice(0, 20))}
                        placeholder="username"
                        disabled={accountBusy || !accountId}
                        data-testid="input-v11-account-username"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleClaimUsername()}
                      disabled={accountBusy || !accountId || !accountUsernameInput.trim()}
                      className="w-full"
                      data-testid="button-v11-claim-username"
                    >
                      Claim Username
                    </Button>
                    {accountId && (
                      <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-100">
                        Ranked profile ready: {accountUsername || "username not claimed"}
                      </div>
                    )}
                    {accountStatus && (
                      <p className="text-xs text-muted-foreground" data-testid="v11-account-status">
                        {accountStatus}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        clearAccountIdentity();
                        setAccountUsernameInput("");
                        setAccountStatus("Account identity cleared from this device.");
                      }}
                      disabled={accountBusy || !accountId}
                      className="w-full text-xs"
                      data-testid="button-v11-clear-account"
                    >
                      Clear Ranked Profile On This Device
                    </Button>
                  </div>
                )}
              </div>}
            </details>
          )}

          <section
            className="rounded-md border border-primary/35 bg-black/20 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
            data-testid="game-settings"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              onClick={() => setGameSettingsOpen((open) => !open)}
              aria-expanded={gameSettingsOpen}
              aria-controls="game-settings-panel"
              data-testid="button-game-settings"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/45 bg-primary/10 text-sm text-primary" aria-hidden>
                  ♠
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Game Settings</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {matchMode === "king" ? "Table Streak" : matchMode === "custom" ? "Private Event" : "Quick Match"} · {matchTarget} pts
                  </span>
                </span>
              </span>
              <span className={`shrink-0 text-primary transition-transform ${gameSettingsOpen ? "rotate-180" : ""}`} aria-hidden>
                ▾
              </span>
            </button>
            {gameSettingsOpen && <div id="game-settings-panel" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Match mode</Label>
                <div className="grid grid-cols-2 gap-2" data-testid="match-mode-picker">
                  {MATCH_MODES.map((m) => {
                    const active = matchMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMatchMode(m.id)}
                        disabled={isCreating || isJoining || isFindingMatch}
                        data-testid={`mode-${m.id}`}
                        className={`flex flex-col items-start text-left rounded-md border px-3 py-2 transition disabled:opacity-50 ${
                          active
                            ? "border-primary bg-primary/15 text-primary shadow-[0_0_0_1px_hsla(35,90%,55%,0.5)]"
                            : "border-border bg-white/5 hover:border-primary/50 hover:bg-primary/5"
                        }`}
                      >
                        <span className="text-sm font-semibold leading-tight">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-snug mt-0.5">{m.blurb}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {matchMode === "king"
                    ? "Table Streak: winner stays, and the next player can join the table."
                    : matchMode === "custom"
                    ? "Private Event: host-managed invite bracket for organized groups."
                    : "Quick Match: one head-to-head game, first to the target wins."}
                </p>
              </div>

              {matchMode === "custom" && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="space-y-2">
                    <Label className="text-sm">Bracket size</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([4, 8, 16, 32] as const).map((s) => (
                        <Button
                          key={s}
                          type="button"
                          variant={tournamentSize === s ? "default" : "outline"}
                          onClick={() => setTournamentSize(s)}
                          disabled={isCreating || isJoining}
                          className="h-12 font-mono"
                          data-testid={`tournament-size-${s}`}
                        >
                          {s} players
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tournament-name" className="text-sm">Tournament name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      id="tournament-name"
                      placeholder="e.g. Friday Night Spades"
                      value={tournamentName}
                      onChange={(e) => setTournamentName(e.target.value.slice(0, 40))}
                      maxLength={40}
                      disabled={isCreating || isJoining}
                      data-testid="input-tournament-name"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-border/50">
                <Label className="text-sm">Match target</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([250, 500] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={matchTarget === t ? "default" : "outline"}
                      onClick={() => setMatchTarget(t)}
                      disabled={isCreating || isJoining}
                      className="h-12 font-mono"
                    >
                      {t} pts
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  First player to reach the target while leading wins. Ties go to tiebreaker rounds.
                </p>
              </div>
            </div>}
          </section>

          <MatchAgreementNotice />

          <V11LeaderboardPanel />

          <div className="pt-4 border-t border-border/50 space-y-2">
            <Button
              onClick={handleSpectate}
              disabled={isCreating || isJoining || isSpectating || isFindingMatch || isFindingRankedMatch || !joinCodeInput || !hasGuestName}
              variant="ghost"
              className="w-full h-12 text-sm font-medium border border-dashed border-border hover:border-primary/50"
              data-testid="button-spectate"
            >
              {isSpectating ? "Joining…" : "Watch Match"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Spectators can watch without seeing hidden hands.
            </p>
          </div>

          <PreGameChecklist />

          {/* Admin access — discreet entry. Tournaments are admin-only; this
              unlocks the Custom Tournament tile + host tools. The secret key is
              sent once and never stored; only an opaque session token lives in
              this tab's sessionStorage. */}
          <div className="pt-3 border-t border-border/40 text-center">
            {isAdmin ? (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary"
                data-testid="admin-mode-badge"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Admin mode
              </span>
            ) : !adminDialogOpen ? (
              <button
                type="button"
                onClick={() => setAdminDialogOpen(true)}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                data-testid="button-admin-access"
              >
                Admin access
              </button>
            ) : (
              <div className="space-y-2 text-left">
                <Label htmlFor="admin-key" className="text-xs">Admin key</Label>
                <div className="flex gap-2">
                  <Input
                    id="admin-key"
                    type="password"
                    autoComplete="off"
                    placeholder="Enter admin key"
                    value={adminKeyInput}
                    onChange={(e) => setAdminKeyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAdminUnlock(); }}
                    disabled={adminUnlocking}
                    className="font-mono text-sm"
                    data-testid="input-admin-key"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleAdminUnlock()}
                    disabled={adminUnlocking || !adminKeyInput.trim()}
                    data-testid="button-admin-unlock"
                  >
                    {adminUnlocking ? "…" : "Unlock"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setAdminDialogOpen(false); setAdminKeyInput(""); }}
                    disabled={adminUnlocking}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-border/40 text-center">
            <LegalFooter />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
