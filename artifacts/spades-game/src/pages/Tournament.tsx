import { useEffect, useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { TournamentMatch, TournamentState } from "@/lib/game";

function MatchCell({
  match,
  highlightName,
}: {
  match: TournamentMatch;
  highlightName?: string;
}) {
  const isMine = (n?: string | null) =>
    !!highlightName && !!n && n.trim().toLowerCase() === highlightName.trim().toLowerCase();

  const aName = match.playerA?.name ?? "TBD";
  const bName = match.playerB?.name ?? "TBD";
  const aWon = match.winner === "A";
  const bWon = match.winner === "B";

  const cellClass = (active: boolean, won: boolean, mine: boolean) =>
    `flex items-center justify-between px-2 py-1.5 rounded text-xs border ${
      won
        ? "border-primary bg-primary/15 text-primary font-semibold"
        : active
        ? mine
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-white/5"
        : "border-border/40 bg-white/[0.02] text-muted-foreground"
    }`;

  return (
    <div
      className="w-full max-w-[200px] rounded-md border border-border/60 bg-card/60 p-1.5 space-y-1 shadow-sm"
      data-testid={`match-${match.id}`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80">{match.id}</span>
        {match.roomCode && !match.winner && (
          <span className="text-[9px] font-mono text-primary/70">{match.roomCode}</span>
        )}
        {match.winner && (
          <span className="text-[9px] uppercase tracking-wider text-primary">Final</span>
        )}
      </div>
      <div className={cellClass(!!match.playerA, aWon, isMine(match.playerA?.name))}>
        <span className="truncate">{aName}</span>
      </div>
      <div className={cellClass(!!match.playerB, bWon, isMine(match.playerB?.name))}>
        <span className="truncate">{bName}</span>
      </div>
    </div>
  );
}

function BracketView({
  t,
  myName,
}: {
  t: TournamentState;
  myName: string;
}) {
  const roundLabel = (roundIdx: number): string => {
    const fromFinal = t.rounds.length - 1 - roundIdx;
    if (fromFinal === 0) return "Finals";
    if (fromFinal === 1) return "Semifinals";
    if (fromFinal === 2) return "Quarterfinals";
    return `Round ${roundIdx + 1}`;
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2" data-testid="bracket">
      {t.rounds.map((round, ri) => (
        <div key={ri} className="flex flex-col gap-3 min-w-[200px]">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
            {roundLabel(ri)}
          </div>
          <div className="flex flex-col gap-3 justify-around flex-1">
            {round.map((m) => (
              <MatchCell key={m.id} match={m} highlightName={myName} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Tournament() {
  const [, params] = useRoute<{ code: string }>("/tournament/:code");
  const [, setLocation] = useLocation();
  const code = (params?.code || "").toUpperCase();
  const { toast } = useToast();
  const { playerName, savePlayerName, saveRoomCode, savePlayerIndex, saveIsSpectator, saveTournamentToken, getTournamentToken } = useGameStorage();
  const {
    connect, connected,
    tournament, subscribeTournament, joinTournament, leaveTournament, startTournament,
    matchAssignment, clearMatchAssignment,
    tournamentEliminated, clearTournamentEliminated,
  } = useSocket();

  const [nameInput, setNameInput] = useState(playerName);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [hostSnapshot, setHostSnapshot] = useState<string | null>(null); // remembered host on join

  useEffect(() => { connect(); }, [connect]);

  // Subscribe / resubscribe whenever socket reconnects.
  useEffect(() => {
    if (!connected || !code) return;
    const token = getTournamentToken(code) || undefined;
    subscribeTournament(code, playerName || undefined, token).catch((err) => {
      toast({ description: typeof err === "string" ? err : "Tournament not found", variant: "destructive" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, code]);

  // When a match is assigned (start or next round), save state + navigate.
  useEffect(() => {
    if (!matchAssignment) return;
    if (matchAssignment.tournamentCode !== code) return;
    savePlayerName(playerName || nameInput);
    saveIsSpectator(false);
    saveRoomCode(matchAssignment.roomCode);
    savePlayerIndex(matchAssignment.playerIndex as 0 | 1);
    toast({ description: `Match ready: ${matchAssignment.matchLabel} vs ${matchAssignment.opponentName}` });
    clearMatchAssignment();
    setLocation(`/room/${matchAssignment.roomCode}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchAssignment]);

  const t = tournament && tournament.code === code ? tournament : null;
  const iAmInRoster = useMemo(() => {
    if (!t || !playerName) return false;
    return t.players.some((p) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase());
  }, [t, playerName]);

  // Track who looks like the host for THIS browser (we can't get socketId from
  // the sanitized state, so we trust the user's view: host is whoever's name
  // matches t.hostName + is in the roster + is us).
  useEffect(() => {
    if (!t) return;
    if (!playerName) return;
    if (t.hostName.trim().toLowerCase() === playerName.trim().toLowerCase()) {
      setHostSnapshot(playerName);
    }
  }, [t, playerName]);

  const iAmHost = !!hostSnapshot && t?.hostName.trim().toLowerCase() === hostSnapshot.trim().toLowerCase();

  const handleJoin = async () => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    setJoining(true);
    try {
      savePlayerName(nameInput.trim());
      const existing = getTournamentToken(code) || undefined;
      const res = await joinTournament(code, nameInput.trim(), existing);
      saveTournamentToken(code, res.token);
      toast({ description: "Joined tournament" });
    } catch (err: unknown) {
      toast({ description: typeof err === "string" ? err : "Failed to join", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    try {
      await leaveTournament(code);
      setLocation("/");
    } catch (err: unknown) {
      toast({ description: typeof err === "string" ? err : "Failed to leave", variant: "destructive" });
    }
  };

  const handleStart = async () => {
    if (!t) return;
    setStarting(true);
    try {
      const token = getTournamentToken(code) || undefined;
      await startTournament(code, token);
    } catch (err: unknown) {
      toast({ description: typeof err === "string" ? err : "Failed to start", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const myMatch = useMemo(() => {
    if (!t || !playerName) return null;
    for (const round of t.rounds) {
      for (const m of round) {
        if (m.winner) continue;
        if (
          m.playerA?.name.trim().toLowerCase() === playerName.trim().toLowerCase() ||
          m.playerB?.name.trim().toLowerCase() === playerName.trim().toLowerCase()
        ) {
          return m;
        }
      }
    }
    return null;
  }, [t, playerName]);

  if (!t) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-mono">{code}</CardTitle>
            <CardDescription>Connecting to tournament…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isLobby = t.status === "lobby";
  const isComplete = t.status === "complete";
  const youWon = isComplete && !!playerName && t.champion?.trim().toLowerCase() === playerName.trim().toLowerCase();
  const youLost = isComplete && !!playerName && iAmInRoster && !youWon;

  return (
    <div className="min-h-[100dvh] p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-primary/30 bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-2 pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-2xl font-serif text-primary" data-testid="tournament-name">
                  {t.name}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Code <span className="font-mono text-primary">{t.code}</span> · {t.size}-player single-elimination · {t.matchTarget} pts per match · Host <span className="font-semibold">{t.hostName}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${
                  isComplete ? "border-primary bg-primary/20 text-primary" :
                  isLobby ? "border-border bg-white/5 text-muted-foreground" :
                  "border-primary/40 bg-primary/10 text-primary"
                }`}>
                  {isLobby ? "Lobby" : isComplete ? "Complete" : "In Progress"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setLocation("/")}>
                  Home
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Eliminated banner */}
        {tournamentEliminated && tournamentEliminated.code === code && !isComplete && (
          <Card className="border-red-500/40 bg-red-500/10">
            <CardContent className="py-3 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-bold text-red-400">Eliminated</span> · Knocked out in Round {tournamentEliminated.round}. Thanks for playing!
              </div>
              <Button size="sm" variant="ghost" onClick={clearTournamentEliminated}>Dismiss</Button>
            </CardContent>
          </Card>
        )}

        {/* Lobby state */}
        {isLobby && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Players ({t.players.length} / {t.size})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: t.size }).map((_, i) => {
                  const p = t.players[i];
                  return (
                    <div
                      key={i}
                      className={`rounded-md border px-3 py-2 text-sm font-medium ${
                        p ? "border-primary/40 bg-primary/10" : "border-dashed border-border bg-white/[0.02] text-muted-foreground"
                      }`}
                      data-testid={`slot-${i}`}
                    >
                      {p ? p.name : "Empty"}
                      {p && p.name === t.hostName && <span className="ml-1 text-xs text-primary/80">(host)</span>}
                    </div>
                  );
                })}
              </div>

              {!iAmInRoster && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <Label htmlFor="t-name">Your name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="t-name"
                      placeholder="Enter player name"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value.slice(0, 24))}
                      className="text-base"
                    />
                    <Button onClick={handleJoin} disabled={joining || !nameInput.trim()} data-testid="button-join-tournament">
                      {joining ? "Joining…" : "Join"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share the code <span className="font-mono text-primary">{t.code}</span> with friends so they can join too.</p>
                </div>
              )}

              {iAmInRoster && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                  <span className="text-sm">You're in as <span className="font-semibold text-primary">{playerName}</span>.</span>
                  {iAmHost && (
                    <Button
                      onClick={handleStart}
                      disabled={starting || t.players.length !== t.size}
                      className="ml-auto"
                      data-testid="button-start-tournament"
                    >
                      {starting ? "Starting…" : t.players.length === t.size ? "Start tournament" : `Need ${t.size - t.players.length} more`}
                    </Button>
                  )}
                  {!iAmHost && (
                    <Button variant="ghost" onClick={handleLeave} className="ml-auto">
                      Leave
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bracket */}
        {!isLobby && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bracket</CardTitle>
            </CardHeader>
            <CardContent>
              <BracketView t={t} myName={playerName || ""} />
            </CardContent>
          </Card>
        )}

        {/* Your match CTA */}
        {!isLobby && myMatch && myMatch.roomCode && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="font-bold text-primary">Your match is live.</span>{" "}
                <span className="text-muted-foreground">
                  {myMatch.playerA?.name} vs {myMatch.playerB?.name}
                </span>
              </div>
              <Button
                onClick={() => {
                  if (!playerName) return;
                  const idx: 0 | 1 = myMatch.playerA?.name.trim().toLowerCase() === playerName.trim().toLowerCase() ? 0 : 1;
                  saveRoomCode(myMatch.roomCode!);
                  savePlayerIndex(idx);
                  saveIsSpectator(false);
                  setLocation(`/room/${myMatch.roomCode}`);
                }}
                data-testid="button-go-to-match"
              >
                Go to your match →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Champion */}
        {isComplete && (
          <Card className="border-primary/60 bg-primary/10 text-center">
            <CardContent className="py-6 space-y-2">
              <div className="text-xs uppercase tracking-widest text-primary/80">Champion</div>
              <div className="text-3xl font-serif text-primary" data-testid="champion-name">
                {t.champion ?? "—"}
              </div>
              {youWon && <div className="text-sm">That's you. 👑</div>}
              {youLost && <div className="text-sm text-muted-foreground">Better luck next bracket.</div>}
              <div className="pt-2">
                <Button variant="ghost" onClick={() => setLocation("/")}>Back to lobby</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
