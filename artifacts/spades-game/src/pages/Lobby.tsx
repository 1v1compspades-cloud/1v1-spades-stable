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
      const res = await createRoom(nameInput, matchTarget);
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

  // Auto-spectate when arriving via a ?mode=spectator link, as soon as
  // we have a connection AND a name on file. If the user has no saved name,
  // we wait for them to enter one and click the (highlighted) Spectate button.
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
      // Spectators have no seat. Clear any stale player index.
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-4xl font-serif text-primary tracking-wider">SPADES</CardTitle>
          <CardDescription className="text-base">Midnight cards. Head to head.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 mt-4">
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
              placeholder="e.g. Gambler" 
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="text-lg py-6"
            />
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
            <p className="text-xs text-muted-foreground">First to reach target and lead wins. Tied at target → tiebreaker.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
            <div className="space-y-4">
              <Button 
                onClick={handleCreate} 
                disabled={isCreating || isJoining || isSpectating} 
                className="w-full py-6 text-lg font-bold"
              >
                {isCreating ? "Creating..." : "Create Room"}
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="CODE" 
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="text-center uppercase font-mono py-6"
                  maxLength={6}
                />
              </div>
              <Button 
                onClick={handleJoin} 
                disabled={isCreating || isJoining || isSpectating || !joinCodeInput} 
                variant="secondary"
                className="w-full py-6 text-lg font-bold"
              >
                {isJoining ? "Joining..." : "Join Game"}
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
              {isSpectating ? "Joining…" : "Join as Spectator"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Watch the match without playing. Hands stay hidden.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
