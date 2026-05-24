import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useSocket } from "@/hooks/useSocket";
import { useGameStorage } from "@/hooks/useGameStorage";
import { CardComponent } from "@/components/Card";
import { isCardPlayable, sortHandBySuit, SUIT_SYMBOLS, SUIT_COLORS } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card as CardType, Suit } from "@/lib/game";

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

export default function Room() {
  const [, params] = useRoute("/room/:roomCode");
  const [, setLocation] = useLocation();
  const roomCode = params?.roomCode;

  const {
    connected, gameState, connect, joinRoom, reconnect,
    startGame, placeBid, playCard, nextRound, newMatch,
    reconnectAsSpectator,
  } = useSocket();
  const {
    playerName, playerIndex, isSpectator,
    savePlayerIndex, saveIsSpectator,
  } = useGameStorage();
  const { toast } = useToast();

  const [bidAmount, setBidAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!roomCode) { setLocation("/"); return; }
    if (!connected) connect();
  }, [roomCode, connected, connect, setLocation]);

  useEffect(() => {
    if (!connected || !roomCode || !playerName || gameState) return;
    if (isSpectator) {
      reconnectAsSpectator(roomCode, playerName).catch(err => {
        toast({ description: err || "Spectator session expired.", variant: "destructive" });
        saveIsSpectator(false);
        setLocation("/");
      });
    } else if (playerIndex !== null) {
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
  }, [connected, roomCode, playerName, gameState, playerIndex, isSpectator, reconnect, reconnectAsSpectator, joinRoom, setLocation, savePlayerIndex, saveIsSpectator, toast]);

  if (!gameState || (!isSpectator && playerIndex === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Connecting to table...
      </div>
    );
  }

  // Spectator: no "me" perspective. We use absolute seats: seat 1 (top) and seat 2 (bottom).
  // Player: bottom = self, top = opponent.
  const spectator = !!gameState.isSpectator || isSpectator;
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
  const handleNewMatch  = () => newMatch(roomCode!);

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
    saveIsSpectator(false);
    setLocation("/");
  };

  // ── Status banner ──────────────────────────────────────────────────────────
  // Compact match-label bar used by both the status banner and the
  // coin-toss/bidding hint blocks so the label stays visible.
  const renderMatchLabelBar = () => (
    <div
      data-testid="match-label"
      className="text-center py-1 px-4 text-[11px] tracking-widest uppercase bg-primary/15 text-primary font-semibold border-b border-primary/20"
    >
      {gameState.matchLabel}
      <span className="text-muted-foreground/70 normal-case tracking-normal font-normal ml-2">
        · Room <span className="font-mono">{roomCode}</span>
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

    return (
      <div>
        {gameState.matchLabel && renderMatchLabelBar()}
        {showTiebreaker && (
          <div className="text-center py-1 px-4 text-xs tracking-wider uppercase bg-orange-500/15 text-orange-300 font-semibold">
            Tiebreaker · Round {gameState.tiebreakerRound} of 3
          </div>
        )}
        <div className={`text-center py-2 px-4 text-sm tracking-wide transition-colors ${colorClass}`}>
          {message}
        </div>
      </div>
    );
  };

  // ── Player info row (renders any seat by index) ────────────────────────────
  const renderPlayerInfo = (idx: 0 | 1) => {
    const isMe = !spectator && idx === playerIndex;
    const p    = gameState.players[idx];
    const name = p?.name;
    const score = gameState.scores[idx];
    const bags  = gameState.bags[idx];
    const bid   = gameState.bids[idx];
    const tricks = gameState.tricks[idx];
    const seatLabel = `Seat ${idx + 1}`;
    const isTurn  = gameState.phase === "playing" && gameState.currentTurnIndex === idx;
    const isBidding = gameState.phase === "bidding" && gameState.currentBidder === idx;
    const isActive = isTurn || isBidding;

    return (
      <div
        data-testid={`player-info-seat-${idx + 1}`}
        className={`flex items-center justify-between px-4 py-3 bg-black/40 border-y backdrop-blur-sm transition-shadow ${
          isActive
            ? "border-primary/60 shadow-[inset_0_0_0_1px_hsla(35,90%,55%,0.5),0_0_12px_-2px_hsla(35,90%,55%,0.35)]"
            : "border-border"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {seatLabel}{isMe ? " · You" : ""}
            </span>
            <span className="font-bold font-serif truncate max-w-[120px]">
              {name ?? "Waiting…"}
              {isActive && <span className="text-primary ml-2 animate-pulse">●</span>}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs tabular-nums">{score} pts</Badge>
            <Badge variant="outline" className={`text-xs tabular-nums ${bags >= 8 ? "border-yellow-500 text-yellow-400" : "text-muted-foreground"}`}>
              {bags} bag{bags !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="text-xs tabular-nums text-muted-foreground">
              {gameState.handSizes?.[idx] ?? 0} cards
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

  // ── Waiting screen (players only — spectators bypass this) ─────────────────
  const renderWaiting = () => {
    const opponent = gameState.players[playerIndex === 0 ? 1 : 0];
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-8 px-4">
        <div className="text-center space-y-3 w-full max-w-xs">
          {gameState.matchLabel && (
            <div
              data-testid="match-label"
              className="inline-block px-3 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-widest"
            >
              {gameState.matchLabel}
            </div>
          )}
          <p className="text-xs text-muted-foreground uppercase tracking-widest">{`Seat ${(playerIndex as number) + 1} · You`}</p>
          <h2 className="text-2xl font-serif text-primary">Room Code</h2>
          <div className="text-5xl font-mono tracking-widest font-bold bg-background p-6 rounded-lg border-2 border-primary shadow-[0_0_15px_rgba(234,179,8,0.2)]">
            {roomCode}
          </div>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(roomCode!, "Room code")}
              data-testid="button-copy-code"
            >
              📋 Copy Room Code
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(buildLink(false), "Player invite link")}
              data-testid="button-copy-player-link"
            >
              🔗 Copy Player Invite Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(buildLink(true), "Spectator link")}
              data-testid="button-copy-spectator-link"
            >
              👀 Copy Spectator Link
            </Button>
          </div>
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
  };

  // ── Spectator waiting screen ──────────────────────────────────────────────
  const renderSpectatorWaiting = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-6 px-4 text-center">
      <Badge variant="outline" className="border-primary/40 text-primary uppercase tracking-widest text-xs">
        Spectator
      </Badge>
      <div>
        {gameState.matchLabel && (
          <div
            data-testid="match-label"
            className="inline-block px-3 py-1 mb-2 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-widest"
          >
            {gameState.matchLabel}
          </div>
        )}
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Watching room</p>
        <div className="text-4xl font-mono tracking-widest font-bold mt-2">{roomCode}</div>
      </div>
      <p className="text-muted-foreground text-sm max-w-xs">
        Waiting for the players to start. You'll see all the action — hands stay hidden.
      </p>
      <div className="w-full max-w-xs grid grid-cols-1 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyToClipboard(buildLink(true), "Spectator link")}
          data-testid="button-copy-spectator-link"
        >
          👀 Copy Spectator Link
        </Button>
        <Button variant="outline" onClick={handleLeaveSpectate}>Leave</Button>
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
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Top seat hidden hand (always hidden — even players don't see opponent's cards) */}
        <div className="absolute top-4 flex justify-center w-full pointer-events-none">
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
        <div className="w-64 h-64 rounded-full border border-white/5 bg-white/5 flex items-center justify-center relative backdrop-blur-sm">
          {gameState.spadesBroken && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground uppercase tracking-widest opacity-60 whitespace-nowrap">
              ♠ Spades Broken
            </div>
          )}
          <div className="flex gap-8 relative z-10">
            <div className="w-24 h-36 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center relative">
              {topCard ? (
                <div className="absolute inset-0 z-10 -translate-y-2">
                  <CardComponent card={topCard} />
                </div>
              ) : null}
              <span className="text-white/20 text-xs font-serif">{topLabel}</span>
            </div>
            <div className="w-24 h-36 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center relative">
              {bottomCard ? (
                <div className="absolute inset-0 z-20 translate-y-2">
                  <CardComponent card={bottomCard} />
                </div>
              ) : null}
              <span className="text-white/20 text-xs font-serif">{bottomLabel}</span>
            </div>
          </div>
        </div>

        {/* Last Card Played — visible to players and spectators */}
        {(gameState.phase === "playing" || gameState.phase === "round_over" || gameState.phase === "game_over") && (() => {
          const last = gameState.lastCardPlayed;
          const playerName = last ? (gameState.players[last.playerIndex]?.name?.split(" ")[0] ?? `Seat ${last.playerIndex + 1}`) : null;
          const suitColor = last ? SUIT_COLORS[last.card.suit] : "";
          const isRed = last && (last.card.suit === "hearts" || last.card.suit === "diamonds");
          return (
            <div
              id="last-card-box"
              data-testid="last-card-box"
              className="absolute top-4 right-4 px-3 py-2 rounded-lg border border-primary/40 bg-card/90 backdrop-blur-sm shadow-lg shadow-black/40 text-center min-w-[120px]"
            >
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Last Card Played
              </h3>
              <div
                id="last-card-played"
                data-testid="last-card-value"
                className={`text-2xl font-bold leading-tight mt-1 tabular-nums ${last ? (isRed ? "text-rose-400" : "text-foreground") : "text-muted-foreground/60"} ${suitColor}`}
              >
                {last ? formatCard(last.card) : "None"}
              </div>
              {last && playerName && (
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[110px]">
                  by {playerName}
                </div>
              )}
            </div>
          );
        })()}

        {/* Coin toss overlay — shown to all roles for ~3.5s, server transitions to bidding */}
        {gameState.phase === "coin_toss" && gameState.coinFlipWinner !== null && (() => {
          const winnerName = gameState.players[gameState.coinFlipWinner]?.name ?? `Seat ${gameState.coinFlipWinner + 1}`;
          const loserIdx: 0 | 1 = gameState.coinFlipWinner === 0 ? 1 : 0;
          const loserName = gameState.players[loserIdx]?.name ?? `Seat ${loserIdx + 1}`;
          const youWon = !spectator && playerIndex === gameState.coinFlipWinner;
          return (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-lg"
              data-testid="coin-toss-overlay"
            >
              <div className="bg-card border border-border p-8 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center space-y-5">
                <div className="text-6xl animate-spin-slow inline-block" aria-hidden>🪙</div>
                <h3 className="text-2xl font-serif text-primary">Coin Toss</h3>
                <p className="text-sm text-muted-foreground">
                  Happens once per match. Winner bids <span className="font-semibold text-foreground">second</span> in Round 1.
                </p>
                <div className="space-y-1 border-y border-border py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Winner</p>
                  <p data-testid="coin-toss-winner" className="text-2xl font-serif font-bold text-primary">
                    {winnerName}{youWon ? " (you)" : ""}
                  </p>
                </div>
                <p className="text-sm">
                  <span className="font-semibold text-foreground" data-testid="coin-toss-first-bidder">{loserName}</span>{" "}
                  bids first in Round 1. Bidding order alternates each round after.
                </p>
                <p className="text-xs text-muted-foreground italic">Dealing cards…</p>
              </div>
            </div>
          );
        })()}

        {/* Bidding overlay (players only) */}
        {!spectator && gameState.phase === "bidding" && gameState.currentBidder === playerIndex && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl shadow-2xl space-y-4 max-w-sm w-full mx-4 text-center">
              <h3 className="text-xl font-serif text-primary">Place your bid</h3>
              {gameState.bids[0] === null && gameState.bids[1] === null && (
                <p className="text-xs uppercase tracking-widest text-primary/80">
                  You bid first this round (Round {gameState.roundNumber})
                </p>
              )}
              {(gameState.bids[0] !== null || gameState.bids[1] !== null) && (
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  You bid second this round
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                You have {gameState.hand.length} cards. Bid 0 for Nil (+/−125).
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

        {/* Round over overlay (shown to everyone, including spectators) */}
        {gameState.phase === "round_over" && lastRound && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-card border border-border p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 space-y-5">
              <h3 className="text-xl font-serif text-center text-primary border-b border-border pb-3">
                Round {lastRound.round} Summary
              </h3>

              <div className="grid grid-cols-2 gap-4 text-center">
                {([0, 1] as (0 | 1)[]).map((idx) => {
                  const isMyCol  = !spectator && idx === playerIndex;
                  const pName    = gameState.players[idx]?.name ?? `Seat ${idx + 1}`;
                  const bid      = lastRound.bids[idx];
                  const tricks   = lastRound.tricks[idx];
                  const delta    = lastRound.scores[idx];
                  const total    = gameState.scores[idx];
                  const newBags  = lastRound.bags[idx];
                  const bagsDelta = newBags - prevBags[idx];
                  const isNil    = bid === 0;
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
                {spectator ? (
                  <p className="text-center text-muted-foreground italic text-sm">Waiting for host to start next round…</p>
                ) : playerIndex === 0 ? (
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
                  if (spectator) {
                    if (s0 === s1) return <p className="text-2xl font-bold text-yellow-400">Draw.</p>;
                    const winnerName = gameState.players[s0 > s1 ? 0 : 1]?.name ?? `Seat ${s0 > s1 ? 1 : 2}`;
                    return <p className="text-2xl font-bold text-green-400">{winnerName} wins 🏆</p>;
                  }
                  const my = gameState.scores[playerIndex as 0 | 1];
                  const opp = gameState.scores[playerIndex === 0 ? 1 : 0];
                  if (my > opp)  return <p className="text-2xl font-bold text-green-400">You Won! 🏆</p>;
                  if (my < opp)  return <p className="text-2xl font-bold text-red-400">You Lost.</p>;
                  return <p className="text-2xl font-bold text-yellow-400">It's a Draw.</p>;
                })()}
                <p className="text-xs text-muted-foreground mt-1">
                  First to {gameState.matchTarget} points
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{gameState.players[0]?.name ?? "Seat 1"}</span>
                  <span>{gameState.players[1]?.name ?? "Seat 2"}</span>
                </div>
                <div className="flex justify-between text-3xl font-mono font-bold">
                  <span className={gameState.scores[0] > gameState.scores[1] ? "text-green-400" : ""}>{gameState.scores[0]}</span>
                  <span className="text-muted-foreground text-lg self-center">vs</span>
                  <span className={gameState.scores[1] > gameState.scores[0] ? "text-green-400" : ""}>{gameState.scores[1]}</span>
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
                const tie = s0 === s1;
                const winIdx = s0 >= s1 ? 0 : 1;
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
                        onClick={() => copyToClipboard(discord, "Discord report")}
                        data-testid="button-copy-discord"
                      >
                        💬 Copy for Discord
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                {spectator ? (
                  <p className="text-center text-muted-foreground italic text-sm">Waiting for host to start a new match…</p>
                ) : playerIndex === 0 ? (
                  <Button onClick={handleNewMatch} className="w-full h-11 text-base">
                    Start New Match →
                  </Button>
                ) : (
                  <p className="text-center text-muted-foreground italic text-sm">Waiting for host to start a new match…</p>
                )}
                <Button
                  onClick={spectator ? handleLeaveSpectate : () => setLocation("/")}
                  variant="outline"
                  className="w-full h-11"
                >
                  {spectator ? "Leave" : "Return to Lobby"}
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
    return (
      <div
        data-testid="my-hand"
        className="flex-shrink-0 max-h-[44vh] overflow-y-auto pt-3 px-2 pb-hand-safe bg-black/30 border-t border-primary/20 shadow-[0_-2px_12px_-6px_hsla(35,90%,55%,0.25)]"
      >
        <div className="flex flex-wrap justify-center items-end gap-x-3 gap-y-2">
          {groups.map((group) => (
            <div
              key={group.suit}
              data-testid={`hand-group-${group.suit}`}
              className="flex flex-wrap justify-center items-end gap-1"
            >
              {group.cards.map((card) => {
                const playable = isCardPlayable(card, gameState, playerIndex as 0 | 1);
                return (
                  <CardComponent
                    key={`${card.suit}-${card.rank}`}
                    card={card}
                    onClick={playable ? () => handlePlayCard(card) : undefined}
                    disabled={!playable}
                  />
                );
              })}
            </div>
          ))}
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

  // ── Root layout ────────────────────────────────────────────────────────────
  // Spectator: never see the waiting screen as theirs — show a neutral version
  // Spectator that joined before host hits "Start" — show waiting screen.
  // (Coin toss and beyond render the normal table layout with overlay.)
  if (spectator && gameState.phase === "waiting") {
    return (
      <div className="h-[100dvh] flex flex-col bg-background overflow-hidden relative">
        {renderSpectatorWaiting()}
        {renderSpectatorFooter()}
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden relative">
      {!spectator && gameState.phase === "waiting" ? (
        renderWaiting()
      ) : (
        <>
          {renderPlayerInfo(topIndex)}
          {renderStatusBanner()}
          {renderTable()}
          {renderPlayerInfo(bottomIndex)}
          {spectator ? renderSpectatorFooter() : renderMyHand()}
        </>
      )}
    </div>
  );
}
