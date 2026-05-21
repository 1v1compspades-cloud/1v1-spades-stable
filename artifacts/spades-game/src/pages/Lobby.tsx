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
  const { connect, createRoom, joinRoom } = useSocket();
  const { playerName, savePlayerName, saveRoomCode, savePlayerIndex } = useGameStorage();
  const { toast } = useToast();
  
  const [nameInput, setNameInput] = useState(playerName);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [matchTarget, setMatchTarget] = useState<250 | 500>(250);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    connect();
  }, [connect]);

  const handleCreate = async (): Promise<void> => {
    if (!nameInput.trim()) { toast({ description: "Please enter your name", variant: "destructive" }); return; }
    setIsCreating(true);
    try {
      savePlayerName(nameInput);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-4xl font-serif text-primary tracking-wider">SPADES</CardTitle>
          <CardDescription className="text-base">Midnight cards. Head to head.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 mt-4">
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
                disabled={isCreating || isJoining} 
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
                disabled={isCreating || isJoining || !joinCodeInput} 
                variant="secondary"
                className="w-full py-6 text-lg font-bold"
              >
                {isJoining ? "Joining..." : "Join Game"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
