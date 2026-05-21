import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { CardComponent } from "@/components/Card";
import { isCardPlayable } from "@/lib/game";
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
    if (!roomCode) { setLocation("/"); return; }
    if (!connected) connect();
  }, [roomCode, connected, connect, setLocation]);

  useEffect(() => {
    if (!connected || !roomCode || !playerName || gameState) return;
    if (playerIndex !== null) {
      reconnect(roomCode, playerIndex, playerName).catch(err => {
        toast({ description: err || "Session expired. Please rejoin.", variant: "destructive" });
        setLocation("/");
      });
    } else {
      joinRoom(roomCode, playerName).then((res) => {
        if (res.playerIndex !== undefined) savePlayerIndex(res.playerIndex as 0 | 1);
      }).catch(err => {
        toast({ description: err || "Failed to join room", variant: "destructive" });
        setLocation("/");
      });
    }
  }, [connected, roomCode, playerName, gameState, playerIndex, reconnect, joinRoom, setLocation, savePlayerIndex, toast]);

  if (!gameState || playerIndex === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Connecting to table...
      </div>
    );
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const me = gameState.players[playerIndex];
  const opponent = gameState.players[opponentIndex];

  const myScore       = gameState.scores[playerIndex];
  const opponentScore = gameState.scores[opponentIndex];
  const myBags        = gameState.bags[playerIndex];
  const opponentBags  = gameState.bags[opponentIndex];
  const myBid         = gameState.bids[playerIndex];
  const opponentBid   = gameState.bids[opponentIndex];
  const myTricks      = gameState.tricks[playerIndex];
  const opponentTricks = gameState.tricks[opponentIndex];

  const handleStartGame = () => startGame(roomCode!);
  const handleNextRound = () => nextRound(roomCode!);

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

  // ── Status banner ──────────────────────────────────────────────────────────
  const renderStatusBanner = () => {
    const { phase, currentBidder, currentTurnIndex } = gameState;
    let message = "";
    let colorClass = "bg-white/5 text-muted-foreground";

    if (phase === "bidding") {
      if (currentBidder === playerIndex) {
        message = "Your turn to bid";
        colorClass = "bg-primary/20 text-primary font-semibold";
      } else {
        message = `${opponent?.name ?? "Opponent"} is bidding…`;
      }
    } else if (phase === "playing") {
      if (currentTurnIndex === null) {
        message = "Trick resolving…";
        colorClass = "bg-white/5 text-muted-foreground italic";
      } else if (currentTurnIndex === playerIndex) {
        message = "Your turn — play a card";
        colorClass = "bg-primary/20 text-primary font-semibold";
      } else {
        message = `${opponent?.name ?? "Opponent"}'s turn`;
      }
    } else if (phase === "round_over") {
      message = "Round complete";
      colorClass = "bg-yellow-500/10 text-yellow-400 font-semibold";
    } else if (phase === "game_over") {
      message = "Game over";
      colorClass = "bg-white/5 text-muted-foreground";
    }

    return (
      <div className={`text-center py-2 px-4 text-sm tracking-wide transition-colors ${colorClass}`}>
        {message}
      </div>
    );
  };

  // ── Player info row ────────────────────────────────────────────────────────
  const renderPlayerInfo = (isMe: boolean) => {
    const idx     = isMe ? playerIndex : opponentIndex;
    const name    = isMe ? me?.name : opponent?.name;
    const score   = isMe ? myScore : opponentScore;
    const bags    = isMe ? myBags : opponentBags;
    const bid     = isMe ? myBid : opponentBid;
    const tricks  = isMe ? myTricks : opponentTricks;
    const seatLabel = `Seat ${(idx as number) + 1}`;
    const isTurn  = gameState.phase === "playing" && gameState.currentTurnIndex === idx;
    const isBidding = gameState.phase === "bidding" && gameState.currentBidder === idx;
    const isActive = isTurn || isBidding;

    return (
      <div className={`flex items-center justify-between px-4 py-3 bg-black/40 border-y border-border backdrop-blur-sm ${isActive ? "ring-1 ring-inset ring-primary" : ""}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{seatLabel}{isMe ? " · You" : ""}</span>
            <span className="font-bold font-serif truncate max-w-[120px]">
              {name ?? "Waiting…"}
              {isActive && <span className="text-primary ml-2 animate-pulse">●</span>}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs tabular-nums">
              {score >= 0 ? score : score} pts
            </Badge>
            <Badge variant="outline" className={`text-xs tabular-nums ${bags >= 8 ? "border-yellow-500 text-yellow-400" : "text-muted-foreground"}`}>
              {bags} bag{bags !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        {gameState.phase !== "waiting" && (
          <div className="flex gap-5 text-right shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Bid</span>
              <span className="text-xl font-bold font-mono">{bid !== null ? bid : "—"}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Tricks</span>
              <span className={`text-xl font-bold font-mono ${bid !== null && tricks > bid ? "text-yellow-400" : tricks === bid && bid !== null ? "text-green-400" : ""}`}>
                {tricks}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Waiting screen ─────────────────────────────────────────────────────────
  const renderWaiting = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-8 px-4">
      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">{`Seat ${(playerIndex as number) + 1} · You`}</p>
        <h2 className="text-2xl font-serif text-primary">Room Code</h2>
        <div className="text-5xl font-mono tracking-widest font-bold bg-background p-6 rounded-lg border-2 border-primary shadow-[0_0_15px_rgba(234,179,8,0.2)]">
          {roomCode}
        </div>
        <p className="text-muted-foreground text-sm mt-4">Share this code with your opponent</p>
      </div>

      {opponent ? (
        <div className="space-y-4 text-center w-full max-w-xs">
          <div className="bg-white/5 rounded-lg p-4 border border-border space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Opponent joined</p>
            <p className="text-xl font-serif font-bold text-primary">{opponent.name}</p>
          </div>
          {playerIndex === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">A coin flip will decide who bids first.</p>
              <Button size="lg" onClick={handleStartGame} className="w-full text-lg h-14">
                Flip Coin &amp; Start
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground italic text-sm">Waiting for host to start the game…</p>
          )}
        </div>
      ) : (
        <div className="text-center space-y-2">
          <div className="animate-pulse text-muted-foreground">Waiting for Player 2…</div>
          <p className="text-xs text-muted-foreground">Give them the room code above</p>
        </div>
      )}
    </div>
  );

  // ── Table (trick area + overlays) ─────────────────────────────────────────
  const renderTable = () => {
    const myTrickCard  = gameState.currentTrick.find(t => t.playerIndex === playerIndex)?.card;
    const oppTrickCard = gameState.currentTrick.find(t => t.playerIndex === opponentIndex)?.card;

    // Round summary data
    const lastRound  = gameState.roundHistory[gameState.roundHistory.length - 1];
    const prevRound  = gameState.roundHistory[gameState.roundHistory.length - 2];
    const prevBags: [number, number] = prevRound ? prevRound.bags : [0, 0];

    return (
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Opponent hidden hand */}
        <div className="absolute top-4 flex justify-center w-full pointer-events-none">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-10">
              {Array.from({ length: gameState.opponentHandSize }).map((_, i) => (
                <CardComponent key={`opp-${i}`} hidden className="scale-75" />
              ))}
            </div>
            {gameState.opponentHandSize > 0 && (
              <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                {gameState.opponentHandSize} card{gameState.opponentHandSize !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Center trick area */}
        <div className="w-64 h-64 rounded-full border border-white/5 bg-white/5 flex items-center justify-center relative backdrop-blur-sm">
          {gameState.spadesBroken && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground uppercase tracking-widest opacity-60 whitespace-nowrap">
              ♠ Spades Broken
            </div>
          )}
          <div className="flex gap-8 relative z-10">
            <div className="w-24 h-36 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center relative">
              {oppTrickCard ? (
                <div className="absolute inset-0 z-10 -translate-y-2">
                  <CardComponent card={oppTrickCard} />
                </div>
              ) : null}
              <span className="text-white/20 text-xs font-serif">{opponent?.name?.split(" ")[0] ?? "Opp"}</span>
            </div>
            <div className="w-24 h-36 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center relative">
              {myTrickCard ? (
                <div className="absolute inset-0 z-20 translate-y-2">
                  <CardComponent card={myTrickCard} />
                </div>
              ) : null}
              <span className="text-white/20 text-xs font-serif">You</span>
            </div>
          </div>
        </div>

        {/* Bidding overlay */}
        {gameState.phase === "bidding" && gameState.currentBidder === playerIndex && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl shadow-2xl space-y-4 max-w-sm w-full mx-4 text-center">
              <h3 className="text-xl font-serif text-primary">Place your bid</h3>
              <p className="text-sm text-muted-foreground">
                You have {gameState.hand.length} cards. Bid 0 for Nil (+/−100).
              </p>
              <div className="flex gap-2">
                <Select value={bidAmount} onValueChange={setBidAmount}>
                  <SelectTrigger className="text-lg h-12">
                    <SelectValue placeholder="Select bid" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 14 }).map((_, i) => (
                      <SelectItem key={i} value={i.toString()}>{i === 0 ? "0 — Nil" : i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleBid} disabled={!bidAmount || isSubmitting} className="h-12 px-8">
                  Bid
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Round over overlay */}
        {gameState.phase === "round_over" && lastRound && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-card border border-border p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 space-y-5">
              <h3 className="text-xl font-serif text-center text-primary border-b border-border pb-3">
                Round {lastRound.round} Summary
              </h3>

              <div className="grid grid-cols-2 gap-4 text-center">
                {([playerIndex, opponentIndex] as (0 | 1)[]).map((idx, col) => {
                  const isMyCol   = idx === playerIndex;
                  const pName     = gameState.players[idx]?.name ?? (isMyCol ? "You" : "Opp");
                  const bid       = lastRound.bids[idx];
                  const tricks    = lastRound.tricks[idx];
                  const delta     = lastRound.scores[idx];
                  const total     = gameState.scores[idx];
                  const newBags   = lastRound.bags[idx];
                  const bagsDelta = newBags - prevBags[idx];
                  const isNil     = bid === 0;
                  const nilMade   = isNil && tricks === 0;
                  const nilBroken = isNil && tricks > 0;
                  const made      = !isNil && tricks >= bid;

                  return (
                    <div key={idx} className={`space-y-2 p-3 rounded-lg ${isMyCol ? "bg-primary/10 border border-primary/20" : "bg-white/5"}`}>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider truncate">{pName}</div>

                      <div className="text-xs space-y-1 text-left">
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
                        {bagsDelta > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bags</span>
                            <span className={`font-mono ${newBags >= 8 ? "text-yellow-400" : "text-muted-foreground"}`}>
                              +{bagsDelta} → {newBags}
                            </span>
                          </div>
                        )}
                      </div>

                      {nilMade   && <div className="text-[11px] text-green-400 font-semibold">✓ Nil made</div>}
                      {nilBroken && <div className="text-[11px] text-red-400 font-semibold">✗ Nil broken</div>}
                      {!isNil && made && tricks > bid && (
                        <div className="text-[11px] text-yellow-400">+{tricks - bid} bag{tricks - bid !== 1 ? "s" : ""}</div>
                      )}
                      {!isNil && !made && (
                        <div className="text-[11px] text-red-400">Set — missed by {bid - tricks}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-1">
                {playerIndex === 0 ? (
                  <Button onClick={handleNextRound} className="w-full h-11 text-base">
                    Start Next Round →
                  </Button>
                ) : (
                  <p className="text-center text-muted-foreground italic text-sm">Waiting for host to start next round…</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Game over overlay */}
        {gameState.phase === "game_over" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg">
            <div className="bg-card border border-border p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center space-y-5">
              <h3 className="text-4xl font-serif text-primary">Game Over</h3>
              <div>
                {myScore > opponentScore ? (
                  <p className="text-2xl font-bold text-green-400">You Won! 🏆</p>
                ) : myScore < opponentScore ? (
                  <p className="text-2xl font-bold text-red-400">You Lost.</p>
                ) : (
                  <p className="text-2xl font-bold text-yellow-400">It's a Draw.</p>
                )}
              </div>
              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{me?.name ?? "You"}</span>
                  <span>{opponent?.name ?? "Opponent"}</span>
                </div>
                <div className="flex justify-between text-3xl font-mono font-bold">
                  <span className={myScore > opponentScore ? "text-green-400" : ""}>{myScore}</span>
                  <span className="text-muted-foreground text-lg self-center">vs</span>
                  <span className={opponentScore > myScore ? "text-green-400" : ""}>{opponentScore}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{myBags} bags</span>
                  <span>{opponentBags} bags</span>
                </div>
              </div>
              <Button onClick={() => setLocation("/")} variant="outline" className="w-full h-11">
                Return to Lobby
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── My hand ────────────────────────────────────────────────────────────────
  const renderMyHand = () => (
    <div className="h-48 flex items-end justify-center pb-8 pt-4 px-4 overflow-x-auto overflow-y-hidden">
      <div className="flex -space-x-8 sm:-space-x-6">
        {gameState.hand.map((card) => {
          const playable = isCardPlayable(card, gameState, playerIndex as 0 | 1);
          return (
            <div
              key={`${card.suit}-${card.rank}`}
              className={`transition-transform z-10 ${playable ? "hover:-translate-y-8 hover:z-50 cursor-pointer" : "cursor-not-allowed"}`}
            >
              <CardComponent
                card={card}
                onClick={playable ? () => handlePlayCard(card) : undefined}
                disabled={!playable}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Root layout ────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden relative">
      {gameState.phase === "waiting" ? (
        renderWaiting()
      ) : (
        <>
          {renderPlayerInfo(false)}
          {renderStatusBanner()}
          {renderTable()}
          {renderPlayerInfo(true)}
          {renderMyHand()}
        </>
      )}
    </div>
  );
}
