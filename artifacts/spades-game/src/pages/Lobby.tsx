import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Lobby() {
  const [, setLocation] = useLocation();
  const { connect, connected, createRoom, joinRoom, joinAsSpectator } = useSocket();
  const { playerName, savePlayerName, saveRoomCode, savePlayerIndex, saveIsSpectator } = useGameStorage();
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
  const [joinCodeInput, setJoinCodeInput] = useState(initialParams.code);
  const [matchTarget, setMatchTarget] = useState<250 | 500>(250);
  const [matchLabel, setMatchLabel] = useState<string>("");
  const [labelMode, setLabelMode] = useState<"none" | "preset" | "custom">("none");
  const LABEL_PRESETS = [
    "Quarterfinal 1", "Quarterfinal 2", "Quarterfinal 3", "Quarterfinal 4",
    "Semifinal 1", "Semifinal 2", "Finals",
  ] as const;
  const MATCH_MODES = [
    { id: "quick",     label: "Quick Match",          blurb: "Jump in, single match" },
    { id: "mock",      label: "Mock Tournament",      blurb: "Practice bracket runs" },
    { id: "sunday",    label: "Sunday Prize",         blurb: "Weekly prize event" },
    { id: "king",      label: "King of the Table",    blurb: "Winner stays, queue challengers" },
    { id: "bo3",       label: "Best of 3 Showmatch",  blurb: "First to 2 wins" },
    { id: "custom",    label: "Custom Tournament",    blurb: "Define your own format" },
  ] as const;
  type MatchMode = typeof MATCH_MODES[number]["id"];
  const [matchMode, setMatchMode] = useState<MatchMode>("quick");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isSpectating, setIsSpectating] = useState(false);
  const [invitedAsSpectator] = useState(initialParams.spectate && !!initialParams.code);
  const [autoSpectateTried, setAutoSpectateTried] = useState(false);

  useEffect(() => {
    connect();
  }, [connect]);

  const handleCreate = async (): Promise<void> => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    setIsCreating(true);
    try {
      savePlayerName(nameInput);
      saveIsSpectator(false);
      const serverMode: "quick" | "king" = matchMode === "king" ? "king" : "quick";
      const res = await createRoom(nameInput, matchTarget, matchLabel.trim() || undefined, serverMode);
      if (res.roomCode && res.playerIndex !== undefined) {
        saveRoomCode(res.roomCode);
        savePlayerIndex(res.playerIndex as 0 | 1);
        setLocation(`/room/${res.roomCode}`);
      }
    } catch (err: any) {
      toast({ description: err || "Failed to create room", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (): Promise<void> => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    if (!joinCodeInput.trim()) { toast({ description: "Please enter a room code", variant: "destructive" }); return; }
    setIsJoining(true);
    try {
      savePlayerName(nameInput);
      saveIsSpectator(false);
      const res = await joinRoom(joinCodeInput.toUpperCase(), nameInput);
      if (res.playerIndex !== undefined) {
        saveRoomCode(joinCodeInput.toUpperCase());
        savePlayerIndex(res.playerIndex as 0 | 1);
        setLocation(`/room/${joinCodeInput.toUpperCase()}`);
      }
    } catch (err: any) {
      toast({ description: err || "Failed to join room", variant: "destructive" });
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
    setIsSpectating(true);
    try {
      savePlayerName(nameInput);
      savePlayerIndex(null);
      saveIsSpectator(true);
      saveRoomCode(code);
      await joinAsSpectator(code, nameInput);
      setLocation(`/room/${code}`);
    } catch (err: any) {
      saveIsSpectator(false);
      toast({ description: err || "Failed to join as spectator", variant: "destructive" });
    } finally {
      setIsSpectating(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md border-primary/30 shadow-2xl shadow-primary/10 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="flex items-center justify-center gap-2 text-primary text-lg" aria-hidden>
            <span>♠</span><span className="text-red-500">♥</span><span className="text-blue-500">♦</span><span className="text-emerald-500">♣</span>
          </div>
          <CardTitle className="text-3xl font-serif text-primary tracking-wider drop-shadow-[0_2px_8px_rgba(234,179,8,0.25)]">
            1v1 COMPETITIVE SPADES
          </CardTitle>
          <div className="flex items-center justify-center">
            <span className="inline-block px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">
              Season 0 Beta
            </span>
          </div>
          <CardDescription className="text-sm font-medium text-foreground/80">
            No partner. No excuses. Head-to-head spades.
          </CardDescription>
          <p className="text-xs text-muted-foreground px-2 leading-relaxed">
            Create a room, send the code to your opponent, and play a live 1v1 match.
          </p>
        </CardHeader>
        <CardContent className="space-y-7 mt-2">
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
          <div className="space-y-2">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              placeholder="Enter player name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="text-lg py-6"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-sm">Match mode</Label>
            <div className="grid grid-cols-2 gap-2" data-testid="match-mode-picker">
              {MATCH_MODES.map((m) => {
                const active = matchMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMatchMode(m.id)}
                    disabled={isCreating || isJoining}
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
              Mode picker is a preview — every selection still creates a standard 1v1 room for now.
            </p>
          </div>

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

          <div className="space-y-2">
            <Label className="text-sm">Match label <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="grid grid-cols-2 gap-2" data-testid="match-label-presets">
              {LABEL_PRESETS.map((p) => {
                const active = labelMode === "preset" && matchLabel === p;
                return (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => { setLabelMode("preset"); setMatchLabel(p); }}
                    disabled={isCreating || isJoining}
                    data-testid={`preset-${p.toLowerCase().replace(/\s+/g, "-")}`}
                    className="h-10 text-xs font-semibold"
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant={labelMode === "custom" ? "default" : "outline"}
                onClick={() => { setLabelMode("custom"); setMatchLabel(""); }}
                disabled={isCreating || isJoining}
                data-testid="preset-custom"
                className="h-10 text-xs font-semibold"
              >
                Custom Label
              </Button>
              <Button
                type="button"
                size="sm"
                variant={labelMode === "none" ? "default" : "ghost"}
                onClick={() => { setLabelMode("none"); setMatchLabel(""); }}
                disabled={isCreating || isJoining}
                data-testid="preset-none"
                className="h-10 text-xs"
              >
                No Label
              </Button>
            </div>
            {labelMode === "custom" && (
              <Input
                id="match-label"
                placeholder="Enter custom match label"
                value={matchLabel}
                onChange={(e) => setMatchLabel(e.target.value.slice(0, 40))}
                maxLength={40}
                disabled={isCreating || isJoining}
                data-testid="input-match-label"
                className="py-5 mt-2"
                autoFocus
              />
            )}
            <p className="text-xs text-muted-foreground">Shown to both players and spectators. Only the host sets this when creating.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
            <div className="space-y-4">
              <Button
                onClick={handleCreate}
                disabled={isCreating || isJoining || isSpectating}
                className="w-full py-6 text-lg font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
              >
                {isCreating ? "Creating..." : "Create Room"}
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter room code"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="text-center uppercase font-mono py-6 placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
                  maxLength={6}
                />
              </div>
              <Button
                onClick={handleJoin}
                disabled={isCreating || isJoining || isSpectating || !joinCodeInput}
                variant="secondary"
                className="w-full py-6 text-lg font-bold active:scale-[0.98] transition-transform"
              >
                {isJoining ? "Joining..." : "Join Match"}
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50 space-y-2">
            <Button
              onClick={handleSpectate}
              disabled={isCreating || isJoining || isSpectating || !joinCodeInput}
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
        </CardContent>
      </Card>
    </div>
  );
}
