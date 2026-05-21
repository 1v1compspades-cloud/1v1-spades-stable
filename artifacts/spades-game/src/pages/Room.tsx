import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { CardComponent } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card as CardType } from "@/lib/game";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function Room() {
  const [, params] = useRoute("/room/:roomCode");
  const [, setLocation] = useLocation();
  const roomCode = params?.roomCode;
  
  const { socket, connected, gameState, connect, joinRoom, reconnect, startGame, placeBid, playCard, nextRound } = useSocket();
  const { playerName, playerIndex, savePlayerIndex, saveRoomCode } = useGameStorage();
  const { toast } = useToast();

  const [bidAmount, setBidAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!roomCode) {
      setLocation("/");
      return;
    }
    
    if (!connected) {
      connect();
    }
  }, [roomCode, connected, connect, setLocation]);

  useEffect(() => {
    if (!connected || !roomCode || !playerName || gameState) return;

    if (playerIndex !== null) {
      // We already have a seat — reconnect to restore it
      reconnect(roomCode, playerIndex, playerName).catch(err => {
        // Room no longer exists (server restarted); go back to lobby
        toast({ description: err || "Session expired. Please rejoin.", variant: "destructive" });
        setLocation("/");
      });
    } else {
      // Fresh join (navigated here directly without a stored seat)
      joinRoom(roomCode, playerName).then((res) => {
        if (res.playerIndex !== undefined) savePlayerIndex(res.playerIndex as 0 | 1);
      }).catch(err => {
        toast({ description: err || "Failed to join room", variant: "destructive" });
        setLocation("/");
      });
    }
  }, [connected, roomCode, playerName, gameState, playerIndex, reconnect, joinRoom, setLocation, savePlayerIndex, toast]);

  if (!gameState || playerIndex === null) {
    return <div className="min-h-screen flex items-center justify-center">Connecting to table...</div>;
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const me = gameState.players[playerIndex];
  const opponent = gameState.players[opponentIndex];
  
  const myScore = gameState.scores[playerIndex];
  const opponentScore = gameState.scores[opponentIndex];
  const myBags = gameState.bags[playerIndex];
  const opponentBags = gameState.bags[opponentIndex];
  const myBid = gameState.bids[playerIndex];
  const opponentBid = gameState.bids[opponentIndex];
  const myTricks = gameState.tricks[playerIndex];
  const opponentTricks = gameState.tricks[opponentIndex];

  const handleStartGame = () => {
    startGame(roomCode!);
  };

  const handleBid = async () => {
    if (!bidAmount) return;
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
    if (gameState.phase !== "playing" || gameState.currentTurnIndex !== playerIndex) return;
    try {
      await playCard(roomCode!, card);
    } catch (err: any) {
      toast({ description: err, variant: "destructive" });
    }
  };

  const handleNextRound = () => {
    nextRound(roomCode!);
  };

  const renderWaiting = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-serif text-primary">Room Code</h2>
        <div className="text-6xl font-mono tracking-widest font-bold bg-background p-6 rounded-lg border-2 border-primary shadow-[0_0_15px_rgba(234,179,8,0.2)]">
          {roomCode}
        </div>
        <p className="text-muted-foreground mt-4">Share this code with your opponent</p>
      </div>

      {opponent ? (
        <div className="space-y-4 text-center">
          <p className="text-xl">Opponent <span className="font-bold text-primary">{opponent.name}</span> has joined!</p>
          {playerIndex === 0 ? (
            <Button size="lg" onClick={handleStartGame} className="w-full text-lg h-14">Start Game</Button>
          ) : (
            <p className="text-muted-foreground italic">Waiting for host to start...</p>
          )}
        </div>
      ) : (
        <div className="animate-pulse text-muted-foreground">Waiting for opponent to join...</div>
      )}
    </div>
  );

  const renderPlayerInfo = (isMe: boolean) => {
    const name = isMe ? me?.name : opponent?.name;
    const score = isMe ? myScore : opponentScore;
    const bags = isMe ? myBags : opponentBags;
    const bid = isMe ? myBid : opponentBid;
    const tricks = isMe ? myTricks : opponentTricks;
    const isTurn = gameState.phase === "playing" && gameState.currentTurnIndex === (isMe ? playerIndex : opponentIndex);
    const isBiddingTurn = gameState.phase === "bidding" && gameState.currentBidder === (isMe ? playerIndex : opponentIndex);

    return (
      <div className={`flex items-center justify-between p-4 bg-black/40 border-y border-border backdrop-blur-sm ${isTurn || isBiddingTurn ? "ring-1 ring-primary inset-0" : ""}`}>
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg font-serif">
            {name || "Waiting..."} {(isTurn || isBiddingTurn) && <span className="text-primary ml-2 animate-pulse">●</span>}
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-muted-foreground">Score: {score}</Badge>
            <Badge variant="outline" className="text-muted-foreground">Bags: {bags}</Badge>
          </div>
        </div>
        <div className="flex gap-4 font-mono text-sm">
          {gameState.phase !== "waiting" && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Bid</span>
                <span className="text-xl font-bold">{bid !== null ? bid : "?"}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Tricks</span>
                <span className="text-xl font-bold">{tricks}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderTable = () => {
    // Current trick
    const myTrickCard = gameState.currentTrick.find(t => t.playerIndex === playerIndex)?.card;
    const oppTrickCard = gameState.currentTrick.find(t => t.playerIndex === opponentIndex)?.card;

    return (
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Opponent hand representation */}
        <div className="absolute top-4 flex justify-center w-full">
          <div className="flex -space-x-12">
            {Array.from({ length: gameState.opponentHandSize }).map((_, i) => (
              <CardComponent key={`opp-${i}`} hidden className="scale-75" />
            ))}
          </div>
        </div>

        {/* Center table area */}
        <div className="w-64 h-64 rounded-full border border-white/5 bg-white/5 flex items-center justify-center relative backdrop-blur-sm">
          {gameState.spadesBroken && (
             <div className="absolute top-2 text-muted-foreground text-xs font-serif uppercase tracking-widest opacity-50">
               Spades Broken
             </div>
          )}
          
          <div className="flex gap-8 relative z-10">
            <div className="w-24 h-36 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center relative">
              {oppTrickCard ? (
                <div className="absolute inset-0 z-10 -translate-y-2">
                  <CardComponent card={oppTrickCard} />
                </div>
              ) : null}
              <span className="text-white/20 text-sm font-serif">Opp</span>
            </div>
            
            <div className="w-24 h-36 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center relative">
              {myTrickCard ? (
                <div className="absolute inset-0 z-20 translate-y-2">
                  <CardComponent card={myTrickCard} />
                </div>
              ) : null}
              <span className="text-white/20 text-sm font-serif">You</span>
            </div>
          </div>
        </div>

        {/* Bidding overlay */}
        {gameState.phase === "bidding" && gameState.currentBidder === playerIndex && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl shadow-2xl space-y-4 max-w-sm w-full text-center">
              <h3 className="text-xl font-serif text-primary">Place your bid</h3>
              <p className="text-sm text-muted-foreground mb-4">Evaluate your hand carefully. 0 is a Nil bid.</p>
              
              <div className="flex gap-2">
                <Select value={bidAmount} onValueChange={setBidAmount}>
                  <SelectTrigger className="text-lg h-12">
                    <SelectValue placeholder="Select bid" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 14 }).map((_, i) => (
                      <SelectItem key={i} value={i.toString()}>{i === 0 ? "0 (Nil)" : i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleBid} disabled={!bidAmount || isSubmitting} className="h-12 px-8">Bid</Button>
              </div>
            </div>
          </div>
        )}

        {/* Round over overlay */}
        {gameState.phase === "round_over" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-card border border-border p-8 rounded-xl shadow-2xl max-w-md w-full space-y-6">
              <h3 className="text-2xl font-serif text-center text-primary border-b border-border pb-4">Round Summary</h3>
              
              <div className="grid grid-cols-2 gap-8 text-center">
                <div>
                  <div className="text-sm text-muted-foreground uppercase tracking-wider mb-2">You</div>
                  <div className="text-3xl font-mono mb-1">{myScore}</div>
                  <div className="text-xs text-muted-foreground">Bid: {myBid} / Tricks: {myTricks}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Opponent</div>
                  <div className="text-3xl font-mono mb-1">{opponentScore}</div>
                  <div className="text-xs text-muted-foreground">Bid: {opponentBid} / Tricks: {opponentTricks}</div>
                </div>
              </div>

              {playerIndex === 0 && (
                <Button onClick={handleNextRound} className="w-full h-12 text-lg">Next Round</Button>
              )}
              {playerIndex !== 0 && (
                <p className="text-center text-muted-foreground italic text-sm">Waiting for host...</p>
              )}
            </div>
          </div>
        )}

        {/* Game over overlay */}
        {gameState.phase === "game_over" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg">
             <div className="bg-card border border-border p-8 rounded-xl shadow-2xl max-w-md w-full text-center space-y-6">
              <h3 className="text-4xl font-serif text-primary">Game Over</h3>
              <p className="text-xl">
                {myScore >= 500 || opponentScore <= -200 || (myScore > opponentScore && opponentScore <= -200) ? 
                  <span className="text-green-500 font-bold">You Won!</span> : 
                  <span className="text-destructive font-bold">You Lost.</span>
                }
              </p>
              <div className="flex justify-center gap-8 text-2xl font-mono mt-4">
                <span>{myScore}</span>
                <span className="text-muted-foreground">-</span>
                <span>{opponentScore}</span>
              </div>
              <Button onClick={() => setLocation("/")} variant="outline" className="w-full">Return to Lobby</Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMyHand = () => {
    const isMyTurn = gameState.phase === "playing" && gameState.currentTurnIndex === playerIndex;

    return (
      <div className="h-48 flex items-end justify-center pb-8 pt-4 px-4 overflow-x-auto overflow-y-hidden">
        <div className="flex -space-x-8 sm:-space-x-6">
          {gameState.hand.map((card, i) => (
            <div key={`${card.suit}-${card.rank}`} className="transition-transform hover:-translate-y-8 z-10 hover:z-50 cursor-pointer">
              <CardComponent 
                card={card} 
                onClick={() => handlePlayCard(card)}
                disabled={!isMyTurn && gameState.phase === "playing"}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden relative">
      {gameState.phase === "waiting" ? (
        renderWaiting()
      ) : (
        <>
          {renderPlayerInfo(false)}
          {renderTable()}
          {renderPlayerInfo(true)}
          {renderMyHand()}
        </>
      )}
    </div>
  );
}
